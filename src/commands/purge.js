import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import { EMBED_COLOR, eReply, eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";
import { checkModerationPermission } from "../utils/moderation.js";
import { ignoredDeletes } from "../events/messageDelete.js";

const BULK_DELETE_MAX_AGE_MS = 13 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;

/**
 * Fetches all messages in a channel, optionally after a specific message ID.
 * @param {import("discord.js").TextBasedChannel} channel - The channel to fetch messages from.
 * @param {string|null} afterId - The message ID to fetch messages after.
 * @returns {Promise<import("discord.js").Message[]>}
 */
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

/**
 * Deletes a list of messages from a channel.
 * @param {import("discord.js").TextBasedChannel} channel - The channel to delete messages from.
 * @param {import("discord.js").Message[]} messages - The messages to delete.
 * @returns {Promise<{deleted: number, failed: number}>}
 */
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
    chunk.forEach((m) => ignoredDeletes.add(m.id));
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
    ignoredDeletes.add(msg.id);
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

/**
 * Command to purge messages in a channel.
 * @module purgeCommand
 */
export default {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Purge messages in a channel (mod only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel to purge messages from")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("Purge mode")
        .setRequired(true)
        .addChoices(
          { name: "user — purge all messages from a user", value: "user" },
          { name: "all — purge entire channel", value: "all" },
          {
            name: "trail — purge from a message onward (all users)",
            value: "trail",
          },
          {
            name: "trail_user — purge from a message onward (that user only)",
            value: "trail_user",
          },
        ),
    )
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription(
          "Purge all messages from this user (mode: user / trail_user).",
        )
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("message_id")
        .setDescription(
          "Required for trail / trail_user modes: the starting message ID",
        )
        .setRequired(false),
    ),

  /**
   * Executes the purge command.
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The interaction object.
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    const replyFn =
      interaction.deferred || interaction.replied
        ? interaction.editReply.bind(interaction)
        : interaction.reply.bind(interaction);

    // Check if the user has moderation permissions
    if (
      !(await checkModerationPermission(
        interaction.guild,
        interaction.user.id,
        "mod",
      ))
    ) {
      return replyFn(
        eReply(
          `${i("ERROR")} ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ`,
          "ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ɪs ʀᴇsᴛʀɪᴄᴛᴇᴅ ᴛᴏ sᴇʀᴠᴇʀ ᴏᴡɴᴇʀs ᴏɴʟʏ.",
        ),
      );
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    const channel = interaction.options.getChannel("channel");
    const mode = interaction.options.getString("mode");
    const targetUser = interaction.options.getUser("user");
    const messageId = interaction.options.getString("message_id");

    // Ensure the channel supports messages
    if (!channel.isTextBased()) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ɪɴᴠᴀʟɪᴅ ᴄʜᴀɴɴᴇʟ`,
          "ᴛʜᴀᴛ ᴄʜᴀɴɴᴇʟ ᴅᴏᴇsɴ'ᴛ sᴜᴘᴘᴏʀᴛ ᴍᴇssᴀɢᴇs.",
        ),
      );
    }

    // Validate required options based on the selected mode
    if ((mode === "user" || mode === "trail_user") && !targetUser) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ᴍɪssɪɴɢ ᴜsᴇʀ`,
          "ʏᴏᴜ ᴍᴜsᴛ ᴘʀᴏᴠɪᴅᴇ ᴀ **ᴜsᴇʀ** ғᴏʀ `user` ᴀɴᴅ `trail_user` ᴍᴏᴅᴇs.",
        ),
      );
    }

    if ((mode === "trail" || mode === "trail_user") && !messageId) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ᴍɪssɪɴɢ ᴍᴇssᴀɢᴇ ɪᴅ`,
          "ʏᴏᴜ ᴍᴜsᴛ ᴘʀᴏᴠɪᴅᴇ ᴀ **ᴍᴇssᴀɢᴇ_ɪᴅ** ғᴏʀ `trail` ᴀɴᴅ `trail_user` ᴍᴏᴅᴇs.",
        ),
      );
    }

    // Verify the starting message exists for trail modes
    if (mode === "trail" || mode === "trail_user") {
      try {
        await channel.messages.fetch(messageId);
      } catch {
        return interaction.editReply(
          eSend(
            `${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`,
            `ᴍᴇssᴀɢᴇ \`${messageId}\` ɴᴏᴛ ғᴏᴜɴᴅ ɪɴ <#${channel.id}>.`,
          ),
        );
      }
    }

    await interaction.editReply(
      eSend(
        `${i("PENDING")} ᴘʀᴏᴄᴇssɪɴɢ`,
        "ғᴇᴛᴄʜɪɴɢ ᴍᴇssᴀɢᴇs, ᴛʜɪs ᴍᴀʏ ᴛᴀᴋᴇ ᴀ ᴍᴏᴍᴇɴᴛ...",
      ),
    );

    let toDelete = [];

    try {
      // Fetch messages based on the selected mode
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
        eSend(
          `${i("ERROR")} ғᴇᴛᴄʜ ғᴀɪʟᴇᴅ`,
          `ғᴀɪʟᴇᴅ ᴛᴏ ғᴇᴛᴄʜ ᴍᴇssᴀɢᴇs: ${err.message}`,
        ),
      );
    }

    if (toDelete.length === 0) {
      return interaction.editReply(
        eSend(
          `${i("SUCCESS")} ɴᴏᴛʜɪɴɢ ᴛᴏ ᴘᴜʀɢᴇ`,
          "ɴᴏ ᴍᴀᴛᴄʜɪɴɢ ᴍᴇssᴀɢᴇs ғᴏᴜɴᴅ.",
        ),
      );
    }

    await interaction.editReply(
      eSend(
        `${i("PENDING")} ᴘᴜʀɢɪɴɢ`,
        `ᴅᴇʟᴇᴛɪɴɢ **${toDelete.length}** ᴍᴇssᴀɢᴇ(s)...`,
      ),
    );

    // Perform the deletion
    const { deleted, failed } = await deleteMessages(channel, toDelete);

    const modeLabel = {
      user: `ᴀʟʟ ᴍᴇssᴀɢᴇs ғʀᴏᴍ <@${targetUser?.id}>`,
      all: "ᴀʟʟ ᴍᴇssᴀɢᴇs",
      trail: `ᴀʟʟ ᴍᴇssᴀɢᴇs ғʀᴏᴍ ᴍᴇssᴀɢᴇ \`${messageId}\` ᴏɴᴡᴀʀᴅ`,
      trail_user: `ᴀʟʟ ᴍᴇssᴀɢᴇs ғʀᴏᴍ <@${targetUser?.id}> ғʀᴏᴍ ᴍᴇssᴀɢᴇ \`${messageId}\` ᴏɴᴡᴀʀᴅ`,
    }[mode];

    // Build the completion embed
    const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${i("PURGE")} ᴘᴜʀɢᴇ ᴄᴏᴍᴘʟᴇᴛᴇ\n**ᴄʜᴀɴɴᴇʟ:** <#${channel.id}>\n**ᴍᴏᴅᴇ:** ${mode}\n**ᴘᴜʀɢᴇᴅ:** ${deleted}${
          failed > 0
            ? `\n**ғᴀɪʟᴇᴅ:** ${failed} (ʟɪᴋᴇʟʏ ᴛᴏᴏ ᴏʟᴅ ᴏʀ ᴀʟʀᴇᴀᴅʏ ᴘᴜʀɢᴇᴅ)`
            : ""
        }\n\n**sᴄᴏᴘᴇ:** ${modeLabel}`,
      ),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-*ᴇxᴇᴄᴜᴛᴇᴅ ʙʏ ${interaction.user.tag}*-`,
      ),
    );

    await interaction
      .editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      })
      .catch((err) => {
        console.warn(
          "[PURGE] Could not edit reply, interaction token likely expired after 15m:",
          err.message,
        );
      });
  },
};
