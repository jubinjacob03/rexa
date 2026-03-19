import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import config from "../../config.js";

const BULK_DELETE_MAX_AGE_MS = 13 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;

async function fetchAllMessages(channel, afterId = null) {
  const all = [];
  let lastId = null;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    all.push(...batch.values());
    lastId = batch.last().id;
  }

  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  if (afterId) {
    const pivotIdx = all.findIndex((m) => m.id === afterId);
    if (pivotIdx === -1) return [];
    return all.slice(pivotIdx);
  }

  return all;
}

async function deleteMessages(channel, messages) {
  let deleted = 0;
  let failed = 0;
  const now = Date.now();

  const recent = messages.filter(
    (m) => now - m.createdTimestamp <= BULK_DELETE_MAX_AGE_MS,
  );
  const old = messages.filter(
    (m) => now - m.createdTimestamp > BULK_DELETE_MAX_AGE_MS,
  );

  for (let i = 0; i < recent.length; i += BATCH_SIZE) {
    const chunk = recent.slice(i, i + BATCH_SIZE);
    try {
      await channel.bulkDelete(chunk, true);
      deleted += chunk.length;
    } catch {
      for (const msg of chunk) {
        try {
          await msg.delete();
          deleted++;
        } catch {
          failed++;
        }
      }
    }
    if (i + BATCH_SIZE < recent.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  for (const msg of old) {
    try {
      await msg.delete();
      deleted++;
    } catch {
      failed++;
    }
    if (deleted % 5 === 0) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { deleted, failed };
}

export default {
  data: new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Delete messages in a channel (mod only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel to delete messages from")
        .setRequired(true),
    )
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription(
          "Delete all messages from this user (mode: user). Omit for other modes.",
        )
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("Deletion mode")
        .setRequired(true)
        .addChoices(
          { name: "user — delete all messages from a user", value: "user" },
          { name: "all — clear entire channel", value: "all" },
          {
            name: "trail — delete from a message onward (all users)",
            value: "trail",
          },
          {
            name: "trail_user — delete from a message onward (that user only)",
            value: "trail_user",
          },
        ),
    )
    .addStringOption((o) =>
      o
        .setName("message_id")
        .setDescription(
          "Required for trail / trail_user modes: the starting message ID",
        )
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(config.ownerRoleId)) {
      return interaction.reply({
        content: "❌ This command is restricted to server owners only.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.getChannel("channel");
    const mode = interaction.options.getString("mode");
    const targetUser = interaction.options.getUser("user");
    const messageId = interaction.options.getString("message_id");

    if (!channel.isTextBased()) {
      return interaction.editReply("❌ That channel doesn't support messages.");
    }

    if ((mode === "user" || mode === "trail_user") && !targetUser) {
      return interaction.editReply(
        "❌ You must provide a **user** for `user` and `trail_user` modes.",
      );
    }

    if ((mode === "trail" || mode === "trail_user") && !messageId) {
      return interaction.editReply(
        "❌ You must provide a **message_id** for `trail` and `trail_user` modes.",
      );
    }

    if (mode === "trail" || mode === "trail_user") {
      try {
        await channel.messages.fetch(messageId);
      } catch {
        return interaction.editReply(
          `❌ Message \`${messageId}\` not found in <#${channel.id}>.`,
        );
      }
    }

    await interaction.editReply(
      "⏳ Fetching messages, this may take a moment...",
    );

    let toDelete = [];

    try {
      switch (mode) {
        case "user": {
          const all = await fetchAllMessages(channel);
          toDelete = all.filter((m) => m.author.id === targetUser.id);
          break;
        }
        case "all": {
          toDelete = await fetchAllMessages(channel);
          break;
        }
        case "trail": {
          toDelete = await fetchAllMessages(channel, messageId);
          break;
        }
        case "trail_user": {
          const fromPivot = await fetchAllMessages(channel, messageId);
          toDelete = fromPivot.filter((m) => m.author.id === targetUser.id);
          break;
        }
      }
    } catch (err) {
      return interaction.editReply(
        `❌ Failed to fetch messages: ${err.message}`,
      );
    }

    if (toDelete.length === 0) {
      return interaction.editReply("✅ No matching messages found to delete.");
    }

    await interaction.editReply(
      `⏳ Deleting **${toDelete.length}** message(s)...`,
    );

    const { deleted, failed } = await deleteMessages(channel, toDelete);

    const modeLabel = {
      user: `all messages from <@${targetUser?.id}>`,
      all: "all messages",
      trail: `all messages from message \`${messageId}\` onward`,
      trail_user: `all messages from <@${targetUser?.id}> from message \`${messageId}\` onward`,
    }[mode];

    const embed = new EmbedBuilder()
      .setColor(failed > 0 ? "#FF5722" : "#4CAF50")
      .setTitle("🗑️ Delete Complete")
      .addFields(
        { name: "Channel", value: `<#${channel.id}>`, inline: true },
        { name: "Mode", value: mode, inline: true },
        { name: "Deleted", value: `${deleted}`, inline: true },
        ...(failed > 0
          ? [
              {
                name: "Failed",
                value: `${failed} (likely too old or already deleted)`,
                inline: false,
              },
            ]
          : []),
        { name: "Scope", value: modeLabel, inline: false },
      )
      .setFooter({ text: `Executed by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};
