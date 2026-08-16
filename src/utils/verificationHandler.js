import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} from "discord.js";
import { createClient } from "@supabase/supabase-js";
import config from "../../config.js";
import { eReply, eSend, addFooter } from "./embed.js";
import { i, icon } from "./icons.js";
import { checkModerationPermission } from "./moderation.js";
import { createLogger } from "./logger.js";

const log = createLogger("verify");

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

export async function getApprovalLogs(limit = 50) {
  const data = await loadData();
  return data.approvalLogs.slice(-limit).reverse();
}

export async function handleSelfRoleToggle(interaction) {
  const roleInfo = SELF_ROLE_MAP[interaction.customId];
  if (!roleInfo) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild =
    interaction.guild ||
    (await interaction.client.guilds.fetch(GUILD_ID).catch(() => null));
  if (!guild) {
    return interaction.editReply(
      eReply(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "sᴇʀᴠᴇʀ ɴᴏᴛ ғᴏᴜɴᴅ."),
    );
  }

  const member = await guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (!member) {
    return interaction.editReply(
      eReply(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "ᴜsᴇʀ ɴᴏᴛ ғᴏᴜɴᴅ."),
    );
  }

  const hasRole = member.roles.cache.has(roleInfo.id);

  try {
    if (hasRole) {
      await member.roles.remove(roleInfo.id);
      return interaction.editReply(
        eReply(
          `${i("DONE")} ʀᴏʟᴇ ʀᴇᴍᴏᴠᴇᴅ`,
          `ʀᴇᴍᴏᴠᴇᴅ **${roleInfo.label}** ғʀᴏᴍ ʏᴏᴜʀ ʀᴏʟᴇs.`,
        ),
      );
    }

    await member.roles.add(roleInfo.id);
    return interaction.editReply(
      eReply(
        `${i("DONE")} ʀᴏʟᴇ ᴀᴅᴅᴇᴅ`,
        `ᴀssɪɢɴᴇᴅ **${roleInfo.label}** ᴛᴏ ʏᴏᴜʀ ʀᴏʟᴇs.`,
      ),
    );
  } catch (error) {
    log.error("Failed to toggle self role:", error);
    return interaction.editReply(
      eReply(`${i("ERROR")} ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ ᴜᴘᴅᴀᴛᴇ ʏᴏᴜʀ ʀᴏʟᴇ."),
    );
  }
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

    if (
      !(await checkModerationPermission(
        interaction.guild,
        interaction.user.id,
        "mod",
      ))
    ) {
      return interaction.reply(
        eReply(
          `${i("ERROR")} ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ`,
          "ᴏɴʟʏ ᴍᴏᴅᴇʀᴀᴛᴏʀs ᴄᴀɴ ᴘʀᴏᴄᴇss ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴs.",
        ),
      );
    }

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
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (member.roles.cache.has(roleId)) {
        return interaction.editReply(
          eReply(
            `${i("ERROR")}ᴀʟʀᴇᴀᴅʏ ᴀssɪɢɴᴇᴅ`,
            `ᴜ sᴇʀ ᴀʟʀᴇᴀᴅʏ ʜᴀs ᴛʜᴇ **${request.requestedRole}** ʀᴏʟᴇ. ɴᴏ ᴄʜᴀɴɢᴇs ᴍᴀᴅᴇ.`,
          ),
        );
      }

      if (
        config.unverifiedRoleId &&
        member.roles.cache.has(config.unverifiedRoleId)
      ) {
        await member.roles.remove(config.unverifiedRoleId).catch(() => null);
      }

      await member.roles.add(roleId);

      const userAvatar = user.displayAvatarURL({ dynamic: true, size: 256 });
      const approvedSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${icon("SUCCESS")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ\n> <@${userId}> ᴡᴀs ɢʀᴀɴᴛᴇᴅ ᴀᴄᴄᴇss.\n\n${icon("PROFILE")} **ᴍᴇᴍʙᴇʀ : ** <@${userId}>\n\n${icon("TYPE")} **ᴀssɪɢɴᴇᴅ ʀᴏʟᴇ : ** \`${request.requestedRole}\``,
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
        null,
        "approved",
      );

      await removeRequest(userId);

      await user
        .send(
          eSend(
            `${i("DONE")}sᴀɪʏᴀɴ ɢᴏᴅs — ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ`,
            `ʏᴏᴜʀ ʀᴇǫᴜᴇsᴛ ʜᴀs ʙᴇᴇɴ ᴀᴘᴘʀᴏᴠᴇᴅ!\n\n**ʀᴏʟᴇ:** ${request.requestedRole}`,
          ),
        )
        .catch(() => log.warn(`Could not DM user ${userId}`));

      await interaction.editReply(
        eReply(
          `${i("DONE")}ᴀᴘᴘʀᴏᴠᴇᴅ`,
          `ᴜ sᴇʀ ʜᴀs ʙᴇᴇɴ ɢɪᴠᴇɴ **${request.requestedRole}** ʀᴏʟᴇ.`,
        ),
      );
    } else if (action === "reject") {
      const userAvatar = user.displayAvatarURL({ dynamic: true, size: 256 });
      const rejectedSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${icon("ERROR")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇᴊᴇᴄᴛᴇᴅ\n> <@${userId}> ᴡᴀs ᴅᴇɴɪᴇᴅ ᴀᴄᴄᴇss.\n\n${icon("PROFILE")} **ᴀᴘᴘʟɪᴄᴀɴᴛ : ** <@${userId}>\n\n${icon("TYPE")} **ʀᴇǫᴜᴇsᴛᴇᴅ ʀᴏʟᴇ : ** \`${request.requestedRole}\``,
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
