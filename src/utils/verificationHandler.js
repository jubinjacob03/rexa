import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { createClient } from "@supabase/supabase-js";
import config from "../../config.js";
import { generateText } from "ai";
import { eReply, eSend, addFooter } from "./embed.js";
import { i, icon } from "./icons.js";
import { getLanguageModel } from "../agents/config.js";
import { createLogger } from "./logger.js";

const log = createLogger("verify");

const NICKNAME_STRIP = new RegExp(
  "[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\u2060\\uFEFF]",
  "g",
);

/**
 * Removes control and zero-width characters and collapses whitespace from a
 * user-supplied nickname so it cannot smuggle in invisible or disruptive content.
 * @param {string} raw
 * @returns {string}
 */
function sanitizeNickname(raw) {
  return String(raw).replace(NICKNAME_STRIP, "").replace(/\s+/g, " ").trim();
}

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SELF_ROLE_MAP = {
  selfrole_pc: { id: "1484879284265943120", label: "PC" },
  selfrole_mobile: { id: "1484879494731923496", label: "Mobile" },
  selfrole_mobile_pc: { id: "1484879567280672778", label: "Mobile-PC" },
  selfrole_18_plus: { id: "1484879828871286995", label: "18+" },
  selfrole_18_minus: { id: "1484879875947888670", label: "18-" },
};

export const pendingInterrogations = new Map();

setInterval(
  () => {
    const now = Date.now();
    for (const [userId, data] of pendingInterrogations.entries()) {
      if (now - data.timestamp > 30 * 60 * 1000) {
        pendingInterrogations.delete(userId);
      }
    }
  },
  30 * 60 * 1000,
);

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

let _cache = null;
let _cacheTTL = 0;
let _writeChain = Promise.resolve();
const CACHE_MS = 5_000;

async function loadData() {
  if (_cache && Date.now() < _cacheTTL) return _cache;

  const { data, error } = await supabase
    .from("bot_verification")
    .select("*")
    .eq("guild_id", GUILD_ID)
    .single();

  if (error && error.code !== "PGRST116") {
    log.error("Failed to load verification data:", error);
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
    log.error("Failed to save verification data:", error);
    _cache = null;
    return;
  }
  _cache = data;
  _cacheTTL = Date.now() + CACHE_MS;
}

/**
 * Serializes read-modify-write operations on the verification record so concurrent
 * callers cannot clobber each other (last-write-wins). Each mutation loads the
 * latest data, applies the mutator, then persists it, strictly one at a time.
 * @param {(data: typeof defaultData) => void | Promise<void>} mutator
 * @returns {Promise<void>}
 */
function mutate(mutator) {
  const next = _writeChain.then(async () => {
    const data = await loadData();
    await mutator(data);
    await saveData(data);
  });
  _writeChain = next.catch(() => {});
  return next;
}

export async function hasPendingRequest(userId) {
  const data = await loadData();
  return userId in data.pendingRequests;
}

/**
 * Creates a new verification request.
 * @param {string} userId - The ID of the user.
 * @param {string} username - The username of the user.
 * @param {string} requestedRole - The name of the requested role.
 * @param {string} requestedRoleId - The ID of the requested role.
 * @param {string} approvalMessageId - The ID of the approval message.
 * @returns {Promise<void>}
 */
export async function createRequest(
  userId,
  username,
  requestedRole,
  requestedRoleId,
  approvalMessageId,
) {
  await mutate((data) => {
    data.pendingRequests[userId] = {
      userId,
      username,
      requestedRole,
      requestedRoleId,
      timestamp: new Date().toISOString(),
      approvalMessageId,
    };
  });
}

export async function getRequest(userId) {
  const data = await loadData();
  return data.pendingRequests[userId] || null;
}

export async function removeRequest(userId) {
  await mutate((data) => {
    delete data.pendingRequests[userId];
  });
}

/**
 * Logs an approval or rejection action.
 * @param {string} userId - The ID of the user.
 * @param {string} username - The username of the user.
 * @param {string} requestedRole - The requested role.
 * @param {string} approvedBy - The username of the approver.
 * @param {string} approvedById - The ID of the approver.
 * @param {string|null} nickname - The assigned nickname, if any.
 * @param {string} status - The status (approved/rejected).
 * @returns {Promise<void>}
 */
export async function logApproval(
  userId,
  username,
  requestedRole,
  approvedBy,
  approvedById,
  nickname,
  status,
) {
  await mutate((data) => {
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
  });
}

export async function getAllPendingRequests() {
  const data = await loadData();
  return data.pendingRequests;
}

export async function getAutoDmEnabled() {
  const data = await loadData();
  return data.autoDmEnabled ?? false;
}

/**
 * Sets the auto DM enabled status.
 * @param {boolean} value - The new status.
 * @returns {Promise<void>}
 */
export async function setAutoDmEnabled(value) {
  await mutate((data) => {
    data.autoDmEnabled = value;
  });
}

/**
 * Gets the auto approve status.
 * @returns {Promise<boolean>} True if auto approve is enabled.
 */
export async function getAutoApprove() {
  const data = await loadData();
  return data.autoApprove ?? false;
}

export async function setAutoApprove(value) {
  await mutate((data) => {
    data.autoApprove = value;
  });
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
      (guildMember.roles.cache.has(config.memberRoleId) ||
        guildMember.roles.cache.has(config.moderatorRoleId))
    ) {
      return interaction.reply(
        eReply(
          `${i("WARNING")} ᴀʟʀᴇᴀᴅʏ ᴠᴇʀɪғɪᴇᴅ`,
          "ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀɴ ᴀᴄᴛɪᴠᴇ ʀᴏʟᴇ. ᴘʟᴇᴀsᴇ ᴀsᴋ ᴀ ᴍᴏᴅᴇʀᴀᴛᴏʀ ғᴏʀ ᴀɴʏ ᴄʜᴀɴɢᴇs.",
        ),
      );
    }

    const isModerator = interaction.customId === "verify_moderator";
    const requestedRole = isModerator ? "Moderator" : "Member";
    const requestedRoleId = isModerator
      ? config.moderatorRoleId
      : config.memberRoleId;

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
            `${i("KEYLOCK")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ`,
            `ᴛᴏ ᴇɴsᴜʀᴇ ʏᴏᴜ'ʀᴇ ᴀ ʜᴜᴍᴀɴ, ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ʜᴇʀᴇ ʙʏ ᴀɴsᴡᴇʀɪɴɢ ᴛʜɪs ǫᴜᴇsᴛɪᴏɴ ᴏʀɢᴀɴɪᴄᴀʟʟʏ:\n> *${question}*`,
          ),
        );
        return interaction.reply(
          eReply(
            `${i("SUCCESS")} ᴄʜᴇᴄᴋ ʏᴏᴜʀ ᴅᴍs`,
            "ɪ'ᴠᴇ sᴇɴᴛ ʏᴏᴜ ᴀ ǫᴜɪᴄᴋ ǫᴜᴇsᴛɪᴏɴ ᴛᴏ ᴠᴇʀɪғʏ ʏᴏᴜ'ʀᴇ ᴀ ʜᴜᴍᴀɴ. ᴀɴsᴡᴇʀ ɪᴛ ᴛʜᴇʀᴇ ᴛᴏ ʀᴇᴄᴇɪᴠᴇ ʏᴏᴜʀ ʀᴏʟᴇ.",
          ),
        );
      } catch {
        pendingInterrogations.delete(userId);
        return interaction.reply(
          eReply(
            `${i("ERROR")} ᴅᴍs ᴅɪsᴀʙʟᴇᴅ`,
            "ɪ ᴄᴏᴜʟᴅɴ'ᴛ ᴅᴍ ʏᴏᴜ. ᴘʟᴇᴀsᴇ ᴇɴᴀʙʟᴇ ᴅᴍs ғʀᴏᴍ sᴇʀᴠᴇʀ ᴍᴇᴍʙᴇʀs sᴏ ᴡᴇ ᴄᴀɴ ᴠᴇʀɪғʏ ʏᴏᴜ.",
          ),
        );
      }
    }

    if (await hasPendingRequest(userId)) {
      return interaction.reply(
        eReply(
          `${i("WARNING")} ᴘᴇɴᴅɪɴɢ ʀᴇǫᴜᴇsᴛ`,
          "ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀ ᴘᴇɴᴅɪɴɢ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ. ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ ғᴏʀ ᴀᴘᴘʀᴏᴠᴀʟ.",
        ),
      );
    }

    const userAvatar = interaction.user.displayAvatarURL({
      dynamic: true,
      size: 256,
    });
    const approvalSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${isModerator ? icon("MODERATOR") : icon("MEMBER_ROLE")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ\n> <@${userId}> ɪs ʀᴇǫᴜᴇsᴛɪɴɢ ᴀᴄᴄᴇss ᴛᴏ ᴛʜᴇ sᴇʀᴠᴇʀ.\n\n${icon("USER")} **ᴀᴘᴘʟɪᴄᴀɴᴛ : ** <@${userId}>\n\n${icon("MEMO")} **ᴜsᴇʀɴᴀᴍᴇ : ** \`${username}\`\n\n${icon("TYPE")} **ᴛᴀʀɢᴇᴛ ʀᴏʟᴇ : ** \`${requestedRole}\`\n\n${icon("KEYLOCK")} **ɪᴅᴇɴᴛɪғɪᴇʀ : ** \`${userId}\``,
        ),
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(userAvatar));

    const approvalContainer = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addSectionComponents(approvalSection);

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

    approvalContainer.addActionRowComponents(approvalButtons);
    addFooter(approvalContainer);

    const approvalsChannel = await guild.channels.fetch(
      config.approvalsChannelId,
    );
    await approvalsChannel
      .send({
        content: `<@&${config.ownerRoleId}> <@&${config.administratorRoleId}> <@&${config.moderatorRoleId}>`,
      })
      .catch(() => null);
    const approvalMessage = await approvalsChannel
      .send({
        components: [approvalContainer],
        flags: MessageFlags.IsComponentsV2,
      })
      .catch(() => null);

    if (!approvalMessage) {
      return interaction.reply(
        eReply(
          `${i("ERROR")} ᴇʀʀᴏʀ`,
          "ғᴀɪʟᴇᴅ ᴛᴏ sᴇɴᴅ ᴀᴘᴘʀᴏᴠᴀʟ ʀᴇǫᴜᴇsᴛ ᴛᴏ ᴛʜᴇ ᴀᴘᴘʀᴏᴠᴀʟs ᴄʜᴀɴɴᴇʟ.",
        ),
      );
    }

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
    log.error("Error handling verification apply:", error);
    if (!interaction.replied)
      await interaction.reply(
        eReply(`${i("ERROR")}ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ sᴜʙᴍɪᴛ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ."),
      );
  }
}

export async function handleSelfRoleToggle(interaction) {
  const roleInfo = SELF_ROLE_MAP[interaction.customId];
  if (!roleInfo) return;

  const guild =
    interaction.guild ||
    (await interaction.client.guilds.fetch(GUILD_ID).catch(() => null));
  if (!guild) {
    return interaction.reply(
      eReply(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "sᴇʀᴠᴇʀ ɴᴏᴛ ғᴏᴜɴᴅ."),
    );
  }

  const member = await guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (!member) {
    return interaction.reply(
      eReply(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "ᴜsᴇʀ ɴᴏᴛ ғᴏᴜɴᴅ."),
    );
  }

  const hasRole = member.roles.cache.has(roleInfo.id);

  try {
    if (hasRole) {
      await member.roles.remove(roleInfo.id);
      return interaction.reply(
        eReply(
          `${i("DONE")} ʀᴏʟᴇ ʀᴇᴍᴏᴠᴇᴅ`,
          `ʀᴇᴍᴏᴠᴇᴅ **${roleInfo.label}** ғʀᴏᴍ ʏᴏᴜʀ ʀᴏʟᴇs.`,
        ),
      );
    }

    await member.roles.add(roleInfo.id);
    return interaction.reply(
      eReply(
        `${i("DONE")} ʀᴏʟᴇ ᴀᴅᴅᴇᴅ`,
        `ᴀssɪɢɴᴇᴅ **${roleInfo.label}** ᴛᴏ ʏᴏᴜʀ ʀᴏʟᴇs.`,
      ),
    );
  } catch (error) {
    log.error("Failed to toggle self role:", error);
    return interaction.reply(
      eReply(`${i("ERROR")} ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ ᴜᴘᴅᴀᴛᴇ ʏᴏᴜʀ ʀᴏʟᴇ."),
    );
  }
}

export async function handleVerificationDM(message) {
  if (message.author.bot) return false;
  const pending = pendingInterrogations.get(message.author.id);
  if (!pending) return false;

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
      maxTokens: 100,
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
    log.error("Verification AI Error:", e);
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
    const parts = interaction.customId.split("_");
    if (parts.length < 3) {
      return interaction.reply(
        eReply(
          `${i("ERROR")} ɪɴᴠᴀʟɪᴅ ᴀᴄᴛɪᴏɴ`,
          "ᴛʜɪs ʙᴜᴛᴛᴏɴ ɪs ᴍᴀʟғᴏʀᴍᴇᴅ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ.",
        ),
      );
    }
    const [action, userId, roleId] = parts;

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
      const modal = new ModalBuilder()
        .setCustomId(`nickname_modal_${userId}_${roleId}`)
        .setTitle("sᴇᴛ sᴇʀᴠᴇʀ ɴɪᴄᴋɴᴀᴍᴇ");

      const nicknameInput = new TextInputBuilder()
        .setCustomId("nickname_input")
        .setLabel('ᴇɴᴛᴇʀ ᴛʜᴇ ɴᴀᴍᴇ ғᴏʀ "ɢᴏᴅ [ɴᴀᴍᴇ]" ғᴏʀᴍᴀᴛ')
        .setPlaceholder("ᴇxᴀᴍᴘʟᴇ: ᴊᴏʜɴ → ɢᴏᴅ ᴊᴏʜɴ")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(26);
      const row = new ActionRowBuilder().addComponents(nicknameInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    } else if (action === "reject") {
      const userAvatar = user.displayAvatarURL({ dynamic: true, size: 256 });
      const rejectedSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${icon("ERROR")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇᴊᴇᴄᴛᴇᴅ\n> <@${userId}> ᴡᴀs ᴅᴇɴɪᴇᴅ ᴀᴄᴄᴇss.\n\n${icon("USER")} **ᴀᴘᴘʟɪᴄᴀɴᴛ : ** <@${userId}>\n\n${icon("TYPE")} **ʀᴇǫᴜᴇsᴛᴇᴅ ʀᴏʟᴇ : ** \`${request.requestedRole}\`\n\n${icon("MODERATOR")} **ʀᴇᴊᴇᴄᴛᴇᴅ ʙʏ : ** <@${interaction.user.id}>`,
          ),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(userAvatar));

      const rejectedContainer = new ContainerBuilder()
        .setAccentColor(0xe74c3c)
        .addSectionComponents(rejectedSection);

      addFooter(rejectedContainer);

      await interaction.update({
        components: [rejectedContainer],
        flags: MessageFlags.IsComponentsV2,
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
        .catch(() => log.warn(`Could not DM user ${userId}`));

      await interaction.followUp(
        eReply(`${i("DONE")}ᴅᴏɴᴇ`, "ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ ʀᴇᴊᴇᴄᴛᴇᴅ ᴀɴᴅ ʟᴏɢɢᴇᴅ."),
      );
    }
  } catch (error) {
    log.error("Error handling approval action:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(
        eReply(`${i("ERROR")}ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ ᴘʀᴏᴄᴇss ᴀᴘᴘʀᴏᴠᴀʟ ᴀᴄᴛɪᴏɴ."),
      );
    }
  }
}

/**
 * Handles the nickname modal submission.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @returns {Promise<void>}
 */
export async function handleNicknameModal(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [, , userId, roleId] = interaction.customId.split("_");
    const rawNickname = interaction.fields.getTextInputValue("nickname_input");
    const nicknameInput = sanitizeNickname(rawNickname);
    const finalNickname = `God ${nicknameInput}`.slice(0, 32);

    const request = await getRequest(userId);
    if (!request) {
      return interaction.editReply(
        eReply(
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
        eReply(`${i("ERROR")}ɴᴏᴛ ғᴏᴜɴᴅ`, "ᴜsᴇʀ ɪs ɴᴏ ʟᴏɴɢᴇʀ ɪɴ ᴛʜᴇ sᴇʀᴠᴇʀ."),
      );
    }

    if (member.roles.cache.has(roleId)) {
      return interaction.editReply(
        eReply(
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

    const userAvatar = member.user.displayAvatarURL({
      dynamic: true,
      size: 256,
    });
    const approvedSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${icon("SUCCESS")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ\n> <@${userId}> ᴡᴀs ɢʀᴀɴᴛᴇᴅ ᴀᴄᴄᴇss.\n\n${icon("USER")} **ᴍᴇᴍʙᴇʀ : ** <@${userId}>\n\n${icon("TYPE")} **ᴀssɪɢɴᴇᴅ ʀᴏʟᴇ : ** \`${request.requestedRole}\`\n\n${icon("EDITOR")} **ɴɪᴄᴋɴᴀᴍᴇ : ** \`${finalNickname}\`\n\n${icon("MODERATOR")} **ᴀᴘᴘʀᴏᴠᴇᴅ ʙʏ : ** <@${interaction.user.id}>`,
        ),
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(userAvatar));

    const approvedContainer = new ContainerBuilder()
      .setAccentColor(0x2ecc71)
      .addSectionComponents(approvedSection);

    addFooter(approvedContainer);

    await interaction.message.edit({
      components: [approvedContainer],
      flags: MessageFlags.IsComponentsV2,
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
      .catch(() => log.warn(`Could not DM user ${userId}`));

    await interaction.editReply(
      eReply(
        `${i("DONE")}ᴀᴘᴘʀᴏᴠᴇᴅ`,
        `ᴜsᴇʀ ʜᴀs ʙᴇᴇɴ ɢɪᴠᴇɴ **${request.requestedRole}** ʀᴏʟᴇ ᴡɪᴛʜ ɴɪᴄᴋɴᴀᴍᴇ **${finalNickname}**.`,
      ),
    );
  } catch (error) {
    log.error("Error handling nickname modal:", error);
    await interaction.editReply(
      eReply(`${i("ERROR")}ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ ᴄᴏᴍᴘʟᴇᴛᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴀʟ."),
    );
  }
}
