import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { createClient } from "@supabase/supabase-js";
import config from "../../config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GUILD_ID = config.guildId;

const defaultData = {
  pendingRequests: {},
  approvalLogs: [],
  autoDmEnabled: false,
};

// 5s in-memory cache
let _cache = null;
let _cacheTTL = 0;
const CACHE_MS = 5_000;

async function loadData() {
  if (_cache && Date.now() < _cacheTTL) return _cache;

  const { data, error } = await supabase
    .from("bot_verification")
    .select("*")
    .eq("guild_id", GUILD_ID)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[ERROR] Failed to load verification data:", error);
    return { ...defaultData };
  }

  if (!data) {
    await saveData({ ...defaultData });
    return { ...defaultData };
  }

  const result = {
    pendingRequests: data.pending_requests ?? {},
    approvalLogs: data.approval_logs ?? [],
    autoDmEnabled: data.auto_dm_enabled ?? false,
  };

  _cache = result;
  _cacheTTL = Date.now() + CACHE_MS;
  return result;
}

async function saveData(data) {
  _cache = null;

  const { error } = await supabase.from("bot_verification").upsert(
    {
      guild_id: GUILD_ID,
      auto_dm_enabled: data.autoDmEnabled,
      pending_requests: data.pendingRequests,
      approval_logs: data.approvalLogs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "guild_id" },
  );

  if (error) {
    console.error("[ERROR] Failed to save verification data:", error);
  }
}

export async function hasPendingRequest(userId) {
  const data = await loadData();
  return userId in data.pendingRequests;
}

export async function createRequest(
  userId,
  username,
  requestedRole,
  requestedRoleId,
  approvalMessageId,
) {
  const data = await loadData();
  data.pendingRequests[userId] = {
    userId,
    username,
    requestedRole,
    requestedRoleId,
    timestamp: new Date().toISOString(),
    approvalMessageId,
  };
  await saveData(data);
}

export async function getRequest(userId) {
  const data = await loadData();
  return data.pendingRequests[userId] || null;
}

export async function removeRequest(userId) {
  const data = await loadData();
  delete data.pendingRequests[userId];
  await saveData(data);
}

export async function logApproval(
  userId,
  username,
  requestedRole,
  approvedBy,
  approvedById,
  nickname,
  status,
) {
  const data = await loadData();
  data.approvalLogs.push({
    userId,
    username,
    requestedRole,
    approvedBy,
    approvedById,
    nickname: nickname || null,
    status,
    timestamp: new Date().toISOString(),
  });
  await saveData(data);
}

export async function getAllPendingRequests() {
  const data = await loadData();
  return data.pendingRequests;
}

export async function getAutoDmEnabled() {
  const data = await loadData();
  return data.autoDmEnabled ?? false;
}

export async function setAutoDmEnabled(value) {
  const data = await loadData();
  data.autoDmEnabled = value;
  await saveData(data);
}

export async function getApprovalLogs(limit = 50) {
  const data = await loadData();
  return data.approvalLogs.slice(-limit).reverse();
}

export async function handleVerificationApply(interaction) {
  try {
    const userId = interaction.user.id;
    const username = interaction.user.tag;

    if (await hasPendingRequest(userId)) {
      return interaction.reply({
        content:
          "⚠️ ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀ ᴘᴇɴᴅɪɴɢ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ. ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ ғᴏʀ ᴀᴘᴘʀᴏᴠᴀʟ.",
        ephemeral: true,
      });
    }

    const guild = await interaction.client.guilds.fetch(GUILD_ID);
    const guildMember = await guild.members.fetch(userId).catch(() => null);
    if (
      guildMember &&
      (guildMember.roles.cache.has(config.friendsRoleId) ||
        guildMember.roles.cache.has(config.memberRoleId))
    ) {
      return interaction.reply({
        content:
          "⚠️ ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀɴ ᴀᴄᴛɪᴠᴇ ʀᴏʟᴇ. ᴘʟᴇᴀsᴇ ᴀsᴋ ᴀ ᴍᴏᴅᴇʀᴀᴛᴏʀ ғᴏʀ ᴀɴʏ ᴄʜᴀɴɢᴇs.",
        ephemeral: true,
      });
    }

    const isFriends = interaction.customId === "verify_friends";
    const requestedRole = isFriends ? "Friends" : "Member";
    const requestedRoleId = isFriends
      ? config.friendsRoleId
      : config.memberRoleId;

    const approvalEmbed = new EmbedBuilder()
      .setColor(isFriends ? "#0099FF" : "#00FF00")
      .setTitle(`${isFriends ? "🌟" : "👑"} ɴᴇᴡ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ`)
      .setDescription(
        `<@${userId}> ʜᴀs ʀᴇǫᴜᴇsᴛᴇᴅ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ғᴏʀ **${requestedRole}** ʀᴏʟᴇ.`,
      )
      .addFields(
        { name: "ᴜsᴇʀ", value: `<@${userId}>`, inline: true },
        { name: "ᴜsᴇʀɴᴀᴍᴇ", value: username, inline: true },
        { name: "ʀᴇǫᴜᴇsᴛᴇᴅ ʀᴏʟᴇ", value: requestedRole, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `ᴜsᴇʀ ɪᴅ: ${userId}` });

    const approvalButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${userId}_${requestedRoleId}`)
        .setLabel("ᴀᴘᴘʀᴏᴠᴇ")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`reject_${userId}_${requestedRoleId}`)
        .setLabel("ʀᴇᴊᴇᴄᴛ")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌"),
    );

    const approvalsChannel = await interaction.guild.channels.fetch(
      config.approvalsChannelId,
    );
    const approvalMessage = await approvalsChannel.send({
      content: `<@&${config.ownerRoleId}> <@&${config.managerRoleId}> <@&${config.moderatorRoleId}>`,
      embeds: [approvalEmbed],
      components: [approvalButtons],
    });

    await createRequest(
      userId,
      username,
      requestedRole,
      requestedRoleId,
      approvalMessage.id,
    );

    await interaction.reply({
      content: `✅ Your verification request for **${requestedRole}** has been submitted. Please wait for approval.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error("[ERROR] Error handling verification apply:", error);
    await interaction.reply({
      content: "❌ Failed to submit verification request.",
      ephemeral: true,
    });
  }
}

export async function handleApprovalAction(interaction) {
  try {
    const [action, userId, roleId] = interaction.customId.split("_");

    const request = await getRequest(userId);
    if (!request) {
      return interaction.reply({
        content: "⚠️ This verification request no longer exists.",
        ephemeral: true,
      });
    }

    const user = await interaction.client.users.fetch(userId);
    const member = await interaction.guild.members
      .fetch(userId)
      .catch(() => null);

    if (!member) {
      await removeRequest(userId);
      return interaction.reply({
        content: "❌ User is no longer in the server.",
        ephemeral: true,
      });
    }

    if (action === "approve") {
      const isFriends = roleId === config.friendsRoleId;

      const modal = new ModalBuilder()
        .setCustomId(`nickname_modal_${userId}_${roleId}`)
        .setTitle("sᴇᴛ sᴇʀᴠᴇʀ ɴɪᴄᴋɴᴀᴍᴇ");

      const nicknameInput = new TextInputBuilder()
        .setCustomId("nickname_input")
        .setLabel(
          isFriends
            ? "ᴇɴᴛᴇʀ ᴛʜᴇ ɴɪᴄᴋɴᴀᴍᴇ"
            : 'ᴇɴᴛᴇʀ ᴛʜᴇ ɴᴀᴍᴇ ғᴏʀ "ɢᴏᴅ [ɴᴀᴍᴇ]" ғᴏʀᴍᴀᴛ',
        )
        .setPlaceholder(
          isFriends ? "ᴇxᴀᴍᴘʟᴇ: ᴊᴏʜɴ" : "ᴇxᴀᴍᴘʟᴇ: ᴊᴏʜɴ → ɢᴏᴅ ᴊᴏʜɴ",
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(isFriends ? 32 : 26);
      const row = new ActionRowBuilder().addComponents(nicknameInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    } else if (action === "reject") {
      const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#FF0000")
        .setTitle("❌ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇᴊᴇᴄᴛᴇᴅ")
        .addFields({
          name: "ʀᴇᴊᴇᴄᴛᴇᴅ ʙʏ",
          value: `<@${interaction.user.id}>`,
          inline: true,
        });

      await interaction.update({
        embeds: [originalEmbed],
        components: [],
      });

      await logApproval(
        userId,
        request.username,
        request.requestedRole,
        interaction.user.tag,
        interaction.user.id,
        null,
        "rejected",
      );

      await removeRequest(userId);

      await user
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setTitle("❌ sᴀɪʏᴀɴ ɢᴏᴅs - ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ғᴀɪʟᴇᴅ")
              .setDescription(
                `sᴏʀʀʏ ᴛᴏ ɪɴғᴏʀᴍ ʏᴏᴜʀ ʀᴇǫᴜᴇsᴛ ғᴏʀ **${request.requestedRole}** ʀᴏʟᴇ ʜᴀs ʙᴇᴇɴ ʀᴇᴊᴇᴄᴛᴇᴅ.`,
              )
              .setTimestamp(),
          ],
        })
        .catch(() => console.log(`[WARN] Could not DM user ${userId}`));

      await interaction.followUp({
        content: `✅ Verification request rejected and logged.`,
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error("[ERROR] Error handling approval action:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Failed to process approval action.",
        ephemeral: true,
      });
    }
  }
}

export async function handleNicknameModal(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const [, , userId, roleId] = interaction.customId.split("_");
    const nicknameInput =
      interaction.fields.getTextInputValue("nickname_input");
    const isFriends = roleId === config.friendsRoleId;
    const finalNickname = isFriends ? nicknameInput : `God ${nicknameInput}`;

    const request = await getRequest(userId);
    if (!request) {
      return interaction.editReply({
        content: "⚠️ This verification request no longer exists.",
      });
    }

    const member = await interaction.guild.members
      .fetch(userId)
      .catch(() => null);
    if (!member) {
      await removeRequest(userId);
      return interaction.editReply({
        content: "❌ User is no longer in the server.",
      });
    }

    if (member.roles.cache.has(roleId)) {
      return interaction.editReply({
        content: `❌ User already has the **${request.requestedRole}** role. No changes made.`,
      });
    }

    if (member.roles.cache.has(config.unverifiedRoleId)) {
      await member.roles.remove(config.unverifiedRoleId);
    }

    await member.roles.add(roleId);

    await member.setNickname(finalNickname);

    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor("#00FF00")
      .setTitle("✅ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ")
      .addFields(
        {
          name: "ᴀᴘᴘʀᴏᴠᴇᴅ ʙʏ",
          value: `<@${interaction.user.id}>`,
          inline: true,
        },
        { name: "ɴɪᴄᴋɴᴀᴍᴇ", value: finalNickname, inline: true },
      );

    await interaction.message.edit({
      embeds: [originalEmbed],
      components: [],
    });

    await logApproval(
      userId,
      request.username,
      request.requestedRole,
      interaction.user.tag,
      interaction.user.id,
      finalNickname,
      "approved",
    );

    await removeRequest(userId);

    const user = await interaction.client.users.fetch(userId);
    await user
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle("✅ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ")
            .setDescription(
              `ʏᴏᴜʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ ʜᴀs ʙᴇᴇɴ ᴀᴘᴘʀᴏᴠᴇᴅ!\n\n**ʀᴏʟᴇ:** ${request.requestedRole}\n**ɴɪᴄᴋɴᴀᴍᴇ:** ${finalNickname}`,
            )
            .setTimestamp(),
        ],
      })
      .catch(() => console.log(`[WARN] Could not DM user ${userId}`));

    await interaction.editReply({
      content: `✅ Verification approved! User has been given **${request.requestedRole}** role with nickname **${finalNickname}**.`,
    });
  } catch (error) {
    console.error("[ERROR] Error handling nickname modal:", error);
    await interaction.editReply({
      content: "❌ Failed to complete verification approval.",
    });
  }
}
