import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from "discord.js";
import { createClient } from "@supabase/supabase-js";
import config from "../../config.js";
import { generateText } from "ai";
import { eReply, eSend, EMBED_COLOR } from "./embed.js";
import { i, icon } from "./icons.js";
import { getLanguageModel } from "../agents/config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* THE AI DM INTERROGATOR */
export const pendingInterrogations = new Map();
const VERIFICATION_QUESTIONS = [
  "What brings you to our community today?",
  "Are you looking forward to any specific game or event here?",
  "If you had to describe your vibe with one emoji, what would it be and why?",
  "What's your favorite thing to do in Discord communities?",
  "Tell me a quick fun fact about yourself before we let you in!",
];

const GUILD_ID = config.guildId;

const defaultData = {
  pendingRequests: {},
  approvalLogs: [],
  autoDmEnabled: false,
  autoApprove: false,
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
    autoApprove: data.auto_approve ?? false,
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
      auto_approve: data.autoApprove,
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

export async function getAutoApprove() {
  const data = await loadData();
  return data.autoApprove ?? false;
}

export async function setAutoApprove(value) {
  const data = await loadData();
  data.autoApprove = value;
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

    const guild = await interaction.client.guilds.fetch(GUILD_ID);
    const guildMember = await guild.members.fetch(userId).catch(() => null);
    if (
      guildMember &&
      (guildMember.roles.cache.has(config.friendsRoleId) ||
        guildMember.roles.cache.has(config.memberRoleId))
    ) {
      return interaction.reply(
        eReply(
          `${i("WARNING")} ᴀʟʀᴇᴀᴅʏ ᴠᴇʀɪғɪᴇᴅ`,
          "ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀɴ ᴀᴄᴛɪᴠᴇ ʀᴏʟᴇ. ᴘʟᴇᴀsᴇ ᴀsᴋ ᴀ ᴍᴏᴅᴇʀᴀᴛᴏʀ ғᴏʀ ᴀɴʏ ᴄʜᴀɴɢᴇs.",
        ),
      );
    }

    const isFriends = interaction.customId === "verify_friends";
    const requestedRole = isFriends ? "Friends" : "Member";
    const requestedRoleId = isFriends
      ? config.friendsRoleId
      : config.memberRoleId;

    // --- AUTO-APPROVE PATH ---
    const autoApproveEnabled = await getAutoApprove();
    if (autoApproveEnabled) {
      if (pendingInterrogations.has(userId)) {
        return interaction.reply(
          eReply(
            `${i("PENDING")} ᴘᴇɴᴅɪɴɢ ɪɴᴛᴇʀʀᴏɢᴀᴛɪᴏɴ`,
            "ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀ ᴘᴇɴᴅɪɴɢ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ. ᴘʟᴇᴀsᴇ ᴄʜᴇᴄᴋ ʏᴏᴜʀ ᴅᴍs!",
          ),
        );
      }

      const question =
        VERIFICATION_QUESTIONS[
          Math.floor(Math.random() * VERIFICATION_QUESTIONS.length)
        ];
      pendingInterrogations.set(userId, {
        requestedRole,
        requestedRoleId,
        question,
        timestamp: Date.now(),
      });

      try {
        await interaction.user.send(
          eSend(
            `${i("SHIELD")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ`,
            `ᴛᴏ ᴇɴsᴜʀᴇ ʏᴏᴜ'ʀᴇ ᴀ ʜᴜᴍᴀɴ, ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ʜᴇʀᴇ ʙʏ ᴀɴsᴡᴇʀɪɴɢ ᴛʜɪs ǫᴜᴇsᴛɪᴏɴ ᴏʀɢᴀɴɪᴄᴀʟʟʏ:\n> *${question}*`,
          ),
        );
        return interaction.reply(
          eReply(
            `${i("SUCCESS")} ᴄʜᴇᴄᴋ ʏᴏᴜʀ ᴅᴍs`,
            "ɪ'ᴠᴇ sᴇɴᴛ ʏᴏᴜ ᴀ ǫᴜɪᴄᴋ ǫᴜᴇsᴛɪᴏɴ ᴛᴏ ᴠᴇʀɪғʏ ʏᴏᴜ'ʀᴇ ᴀ ʜᴜᴍᴀɴ. ᴀɴsᴡᴇʀ ɪᴛ ᴛʜᴇʀᴇ ᴛᴏ ʀᴇᴄᴇɪᴠᴇ ʏᴏᴜʀ ʀᴏʟᴇ.",
          ),
        );
      } catch (e) {
        pendingInterrogations.delete(userId);
        return interaction.reply(
          eReply(
            `${i("ERROR")} ᴅᴍs ᴅɪsᴀʙʟᴇᴅ`,
            "ɪ ᴄᴏᴜʟᴅɴ'ᴛ ᴅᴍ ʏᴏᴜ. ᴘʟᴇᴀsᴇ ᴇɴᴀʙʟᴇ ᴅᴍs ғʀᴏᴍ sᴇʀᴠᴇʀ ᴍᴇᴍʙᴇʀs sᴏ ᴡᴇ ᴄᴀɴ ᴠᴇʀɪғʏ ʏᴏᴜ.",
          ),
        );
      }
    }

    // --- MANUAL APPROVAL PATH (original flow) ---
    if (await hasPendingRequest(userId)) {
      return interaction.reply(
        eReply(
          `${i("WARNING")} ᴘᴇɴᴅɪɴɢ ʀᴇǫᴜᴇsᴛ`,
          "ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀ ᴘᴇɴᴅɪɴɢ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ. ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ ғᴏʀ ᴀᴘᴘʀᴏᴠᴀʟ.",
        ),
      );
    }

    const approvalEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(
        `${isFriends ? icon("FRIENDS_ROLE") : icon("MEMBER_ROLE")} ɴᴇᴡ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ`,
      )
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
        .setEmoji(icon("SUCCESS")),
      new ButtonBuilder()
        .setCustomId(`reject_${userId}_${requestedRoleId}`)
        .setLabel("ʀᴇᴊᴇᴄᴛ")
        .setStyle(ButtonStyle.Danger)
        .setEmoji(icon("ERROR")),
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

    await interaction.reply(
      eReply(
        `${i("DONE")} ʀᴇǫᴜᴇsᴛ sᴜʙᴍɪᴛᴛᴇᴅ`,
        `ʏᴏᴜʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ ғᴏʀ **${requestedRole}** ʜᴀs ʙᴇᴇɴ sᴜʙᴍɪᴛᴛᴇᴅ. ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ ғᴏʀ ᴀᴘᴘʀᴏᴠᴀʟ.`,
      ),
    );
  } catch (error) {
    console.error("[ERROR] Error handling verification apply:", error);
    if (!interaction.replied)
      await interaction.reply(
        eReply(`${i("ERROR")}ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ sᴜʙᴍɪᴛ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ."),
      );
  }
}

export async function handleVerificationDM(message) {
  if (message.author.bot) return false;
  const pending = pendingInterrogations.get(message.author.id);
  if (!pending) return false;

  // Timeout (10 minutes)
  if (Date.now() - pending.timestamp > 10 * 60 * 1000) {
    pendingInterrogations.delete(message.author.id);
    await message.author
      .send(
        eSend(
          `${i("PENDING")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴛɪᴍᴇᴅ ᴏᴜᴛ`,
          "ʏᴏᴜʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴛɪᴍᴇᴅ ᴏᴜᴛ. ᴘʟᴇᴀsᴇ ᴄʟɪᴄᴋ ᴛʜᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʙᴜᴛᴛᴏɴ ɪɴ ᴛʜᴇ sᴇʀᴠᴇʀ ᴀɢᴀɪɴ.",
        ),
      )
      .catch(() => null);
    return true;
  }

  try {
    const analyzingMsg = await message.author
      .send(eSend(`${i("BOT")} ᴀɴᴀʟʏᴢɪɴɢ`, "ᴀɴᴀʟʏᴢɪɴɢ ʏᴏᴜʀ ʀᴇsᴘᴏɴsᴇ..."))
      .catch(() => null);

    const prompt =
      "You are a server bot verifying if someone is a real human, not a bot or spam account.\n" +
      'The question asked was: "' +
      pending.question +
      '"\n' +
      'The user replied: "' +
      message.content +
      '"\n' +
      'Your only job is to check if this reply could have been written by a real human. Even if the answer is short, silly, off-topic, or incorrect — if it reads like a human typed it, output "PASS". Only output "FAIL" if the response is completely empty, pure gibberish (random characters), or is an obvious automated/bot reply. Output only "PASS" or "FAIL", nothing else.';

    const result = await generateText({
      model: getLanguageModel("fast"),
      prompt: prompt,
    });

    const decision = result.text.trim().toUpperCase();

    if (decision.includes("PASS")) {
      const guild = await message.client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(message.author.id);

      await member.roles.add(pending.requestedRoleId);
      if (
        config.unverifiedRoleId &&
        member.roles.cache.has(config.unverifiedRoleId)
      ) {
        await member.roles.remove(config.unverifiedRoleId).catch(() => null);
      }

      pendingInterrogations.delete(message.author.id);
      if (analyzingMsg) await analyzingMsg.delete().catch(() => null);
      await message.author
        .send(
          eSend(
            `${i("SUCCESS")} ᴀᴜᴛʜᴇɴᴛɪᴄᴀᴛɪᴏɴ ᴄᴏᴍᴘʟᴇᴛᴇ`,
            `ʏᴏᴜ'ᴠᴇ ʙᴇᴇɴ ɢʀᴀɴᴛᴇᴅ ᴛʜᴇ **${pending.requestedRole}** ʀᴏʟᴇ. ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ᴛʜᴇ sᴇʀᴠᴇʀ!`,
          ),
        )
        .catch(() => null);
    } else {
      pendingInterrogations.delete(message.author.id);
      if (analyzingMsg) await analyzingMsg.delete().catch(() => null);
      await message.author
        .send(
          eSend(
            `${i("ERROR")} ᴀᴜᴛʜᴇɴᴛɪᴄᴀᴛɪᴏɴ ғᴀɪʟᴇᴅ`,
            "ʏᴏᴜʀ ʀᴇsᴘᴏɴsᴇ ᴅɪᴅ ɴᴏᴛ ᴘᴀss ᴏᴜʀ ᴄʜᴇᴄᴋs. ɪғ ʏᴏᴜ ᴛʜɪɴᴋ ᴛʜɪs ᴡᴀs ᴀ ᴍɪsᴛᴀᴋᴇ, ʏᴏᴜ ᴄᴀɴ ᴛʀʏ ᴀɢᴀɪɴ ʙʏ ᴄʟɪᴄᴋɪɴɢ ᴛʜᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʙᴜᴛᴛᴏɴ ɪɴ ᴛʜᴇ sᴇʀᴠᴇʀ.",
          ),
        )
        .catch(() => null);
    }
  } catch (e) {
    console.error("[ERROR] Verification AI Error:", e);
    await message.author
      .send(
        eSend(
          `${i("WARNING")} sʏsᴛᴇᴍ ᴇʀʀᴏʀ`,
          "ᴏᴜʀ ᴀɪ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ sʏsᴛᴇᴍ ᴇɴᴄᴏᴜɴᴛᴇʀᴇᴅ ᴀɴ ᴇʀʀᴏʀ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.",
        ),
      )
      .catch(() => null);
    pendingInterrogations.delete(message.author.id);
  }
  return true;
}

export async function handleApprovalAction(interaction) {
  try {
    const [action, userId, roleId] = interaction.customId.split("_");

    const request = await getRequest(userId);
    if (!request) {
      return interaction.reply(
        eReply(
          `${i("WARNING")} ɴᴏᴛ ғᴏᴜɴᴅ`,
          "ᴛʜɪs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ ɴᴏ ʟᴏɴɢᴇʀ ᴇxɪsᴛs.",
        ),
      );
    }

    const user = await interaction.client.users.fetch(userId);
    const member = await interaction.guild.members
      .fetch(userId)
      .catch(() => null);

    if (!member) {
      await removeRequest(userId);
      return interaction.reply(
        eReply(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "ᴜsᴇʀ ɪs ɴᴏ ʟᴏɴɢᴇʀ ɪɴ ᴛʜᴇ sᴇʀᴠᴇʀ."),
      );
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
        .setColor(EMBED_COLOR)
        .setTitle(`${icon("ERROR")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇᴊᴇᴄᴛᴇᴅ`)
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
        .send(
          eSend(
            `${i("ERROR")}sᴀɪʏᴀɴ ɢᴏᴅs — ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴅᴇᴄʟɪɴᴇᴅ`,
            `sᴏʀʀʏ, ʏᴏᴜʀ ʀᴇǫᴜᴇsᴛ ғᴏʀ **${request.requestedRole}** ʀᴏʟᴇ ʜᴀs ʙᴇᴇɴ ʀᴇᴊᴇᴄᴛᴇᴅ.`,
          ),
        )
        .catch(() => console.log(`[WARN] Could not DM user ${userId}`));

      await interaction.followUp(
        eReply(`${i("DONE")}ᴅᴏɴᴇ`, "ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ ʀᴇᴊᴇᴄᴛᴇᴅ ᴀɴᴅ ʟᴏɢɢᴇᴅ."),
      );
    }
  } catch (error) {
    console.error("[ERROR] Error handling approval action:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(
        eReply(`${i("ERROR")}ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ ᴘʀᴏᴄᴇss ᴀᴘᴘʀᴏᴠᴀʟ ᴀᴄᴛɪᴏɴ."),
      );
    }
  }
}

export async function handleNicknameModal(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [, , userId, roleId] = interaction.customId.split("_");
    const nicknameInput =
      interaction.fields.getTextInputValue("nickname_input");
    const isFriends = roleId === config.friendsRoleId;
    const finalNickname = isFriends ? nicknameInput : `God ${nicknameInput}`;

    const request = await getRequest(userId);
    if (!request) {
      return interaction.editReply(
        eSend(
          `${i("WARNING")}ɴᴏᴛ ғᴏᴜɴᴅ`,
          "ᴛʜɪs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ ɴᴏ ʟᴏɴɢᴇʀ ᴇxɪsᴛs.",
        ),
      );
    }

    const member = await interaction.guild.members
      .fetch(userId)
      .catch(() => null);
    if (!member) {
      await removeRequest(userId);
      return interaction.editReply(
        eSend(`${i("ERROR")}ɴᴏᴛ ғᴏᴜɴᴅ`, "ᴜsᴇʀ ɪs ɴᴏ ʟᴏɴɢᴇʀ ɪɴ ᴛʜᴇ sᴇʀᴠᴇʀ."),
      );
    }

    if (member.roles.cache.has(roleId)) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")}ᴀʟʀᴇᴀᴅʏ ᴀssɪɢɴᴇᴅ`,
          `ᴜsᴇʀ ᴀʟʀᴇᴀᴅʏ ʜᴀs ᴛʜᴇ **${request.requestedRole}** ʀᴏʟᴇ. ɴᴏ ᴄʜᴀɴɢᴇs ᴍᴀᴅᴇ.`,
        ),
      );
    }

    if (member.roles.cache.has(config.unverifiedRoleId)) {
      await member.roles.remove(config.unverifiedRoleId);
    }

    await member.roles.add(roleId);

    await member.setNickname(finalNickname);

    const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(EMBED_COLOR)
      .setTitle(`${icon("SUCCESS")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ`)
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
      .send(
        eSend(
          `${i("DONE")}sᴀɪʏᴀɴ ɢᴏᴅs — ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ`,
          `ʏᴏᴜʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ ʜᴀs ʙᴇᴇɴ ᴀᴘᴘʀᴏᴠᴇᴅ!\n\n**ʀᴏʟᴇ:** ${request.requestedRole}\n**ɴɪᴄᴋɴᴀᴍᴇ:** ${finalNickname}`,
        ),
      )
      .catch(() => console.log(`[WARN] Could not DM user ${userId}`));

    await interaction.editReply(
      eSend(
        `${i("DONE")}ᴀᴘᴘʀᴏᴠᴇᴅ`,
        `ᴜsᴇʀ ʜᴀs ʙᴇᴇɴ ɢɪᴠᴇɴ **${request.requestedRole}** ʀᴏʟᴇ ᴡɪᴛʜ ɴɪᴄᴋɴᴀᴍᴇ **${finalNickname}**.`,
      ),
    );
  } catch (error) {
    console.error("[ERROR] Error handling nickname modal:", error);
    await interaction.editReply(
      eSend(`${i("ERROR")}ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ ᴄᴏᴍᴘʟᴇᴛᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴀʟ."),
    );
  }
}
