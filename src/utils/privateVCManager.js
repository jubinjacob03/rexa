import { ChannelType, PermissionFlagsBits } from "discord.js";
import config from "../../config.js";

const ROMAN = ["ɪ", "ɪɪ", "ɪɪɪ", "ɪᴠ", "ᴠ"];
/**
 * Converts a number to a Roman numeral (1-5).
 * @param {number} n - The number to convert.
 * @returns {string} The Roman numeral or string representation.
 */
function toRoman(n) {
  return ROMAN[n - 1] ?? String(n);
}

const activeVCs = new Map();
let highestIndex = 0;
let pendingCreations = 0;

function logPrivateVCError(action, err) {
  console.error(`[PrivateVC] ${action} failed:`, err);
}

const {
  categoryId: CATEGORY_ID,
  lobbyVCId: LOBBY_VC_ID,
  maxSimultaneous: MAX_VCS,
  idleTimeoutMs: IDLE_MS,
  maxLifetimeMs: MAX_MS,
} = config.privateVC;

/**
 * Generates a name for a private VC based on its index.
 * @param {number} index - The index of the VC.
 * @returns {string} The generated name.
 */
function vcName(index) {
  return `🎟️〢・ᴘʀɪᴠᴀᴛᴇ-ᴠᴄ ${toRoman(index)}`;
}

function memberOverwrite(userId) {
  return {
    id: userId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.Stream,
      PermissionFlagsBits.UseVAD,
      PermissionFlagsBits.SendMessages,
    ],
  };
}

/**
 * Tears down a private VC: moves any remaining members to the lobby, deletes the
 * channel, and clears its timers. Idempotent — the registry entry is claimed
 * before any await, so overlapping calls (idle timer, max-lifetime timer, or a
 * manual delete) for the same channel become no-ops rather than deleting twice.
 * @param {string} channelId - The ID of the private VC channel.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @returns {Promise<void>}
 */
async function destroyVC(channelId, guild) {
  const data = activeVCs.get(channelId);
  if (!data) return;

  activeVCs.delete(channelId);

  clearTimeout(data.idleTimer);
  clearTimeout(data.maxTimer);

  const channel = guild.channels.cache.get(channelId);
  if (channel) {
    const lobby = guild.channels.cache.get(LOBBY_VC_ID);
    if (lobby) {
      for (const [, member] of channel.members) {
        await member.voice.setChannel(lobby).catch((err) =>
          logPrivateVCError(`Move ${member.id} to lobby`, err),
        );
      }
    }
    await channel.delete();
  }

  if (activeVCs.size === 0) highestIndex = 0;
}

/**
 * Starts the idle timer for a private VC.
 * @param {string} channelId - The ID of the channel.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 */
function startIdleTimer(channelId, guild) {
  const data = activeVCs.get(channelId);
  if (!data) return;
  clearTimeout(data.idleTimer);
  data.idleTimer = setTimeout(() => {
    destroyVC(channelId, guild).catch((err) =>
      logPrivateVCError(`Idle cleanup for ${channelId}`, err),
    );
  }, IDLE_MS);
}

function stopIdleTimer(channelId) {
  const data = activeVCs.get(channelId);
  if (!data) return;
  clearTimeout(data.idleTimer);
  data.idleTimer = null;
}

export function canCreate() {
  return activeVCs.size + pendingCreations < MAX_VCS;
}

export function getVCByCreator(userId) {
  for (const [channelId, data] of activeVCs) {
    if (data.creatorId === userId) return channelId;
  }
  return null;
}

export function isVCCreator(channelId, member) {
  const data = activeVCs.get(channelId);
  return data?.creatorId === member.id;
}

export function isOwner(member) {
  return member.roles.cache.has(config.ownerRoleId);
}

export function canManageVC(channelId, member) {
  return isVCCreator(channelId, member) || isOwner(member);
}

/**
 * Gets the number of active private VCs.
 * @returns {number} The number of active VCs.
 */
export function activeCount() {
  return activeVCs.size;
}

export function isPrivateVC(channelId) {
  return activeVCs.has(channelId);
}

/**
 * Gets the data for a private VC.
 * @param {string} channelId - The ID of the channel.
 * @returns {Object|undefined} The VC data.
 */
export function getVCData(channelId) {
  return activeVCs.get(channelId);
}

/**
 * Gets the private VC channel ID for a member.
 * @param {string} userId - The ID of the user.
 * @returns {string|null} The channel ID or null if not found.
 */
export function getVCByMember(userId) {
  for (const [channelId, data] of activeVCs) {
    if (data.members.has(userId)) return channelId;
  }
  return null;
}

/**
 * Creates a new private VC, moving any voice-connected members into it.
 *
 * A synchronous reservation counter (`pendingCreations`) holds a slot across the
 * asynchronous channel creation so concurrent invocations cannot exceed
 * `MAX_VCS`. If moving members fails, the freshly created channel is rolled back.
 *
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @param {import('discord.js').GuildMember[]} members - Array of members to add (invoker included).
 * @returns {Promise<import('discord.js').VoiceChannel|null>} The created channel, or null if the cap is reached.
 */
export async function createPrivateVC(guild, members) {
  if (activeVCs.size + pendingCreations >= MAX_VCS) return null;

  pendingCreations++;
  try {
    highestIndex++;
    const index = highestIndex;
    const name = vcName(index);

    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
      {
        id: config.ownerRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.UseVAD,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.MoveMembers,
        ],
      },
      ...members.map((m) => memberOverwrite(m.id)),
    ];

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: CATEGORY_ID,
      permissionOverwrites,
    });

    try {
      for (const member of members) {
        if (member.voice?.channel) {
          await member.voice.setChannel(channel);
        }
      }
    } catch (err) {
      await channel.delete().catch((deleteErr) =>
        logPrivateVCError(`Rollback delete for ${channel.id}`, deleteErr),
      );
      throw err;
    }

    const memberSet = new Set(members.map((m) => m.id));
    const creatorId = members[0]?.id ?? null;

    const maxTimer = setTimeout(() => {
      destroyVC(channel.id, guild).catch((err) =>
        logPrivateVCError(`Max lifetime cleanup for ${channel.id}`, err),
      );
    }, MAX_MS);

    activeVCs.set(channel.id, {
      members: memberSet,
      creatorId,
      index,
      idleTimer: null,
      maxTimer,
    });

    if (channel.members.size === 0) {
      startIdleTimer(channel.id, guild);
    }

    return channel;
  } finally {
    pendingCreations--;
  }
}

/**
 * Adds a member to a private VC.
 * @param {string} channelId - The ID of the channel.
 * @param {import('discord.js').GuildMember} member - The member to add.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @returns {Promise<boolean>} True if successful.
 */
export async function addMember(channelId, member, guild) {
  const data = activeVCs.get(channelId);
  if (!data) return false;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return false;

  await channel.permissionOverwrites.create(member.id, {
    ViewChannel: true,
    Connect: true,
    Speak: true,
    Stream: true,
    UseVAD: true,
    SendMessages: true,
  });

  if (member.voice?.channel) {
    await member.voice.setChannel(channel);
  }

  data.members.add(member.id);
  return true;
}

export async function removeMember(channelId, member, guild) {
  const data = activeVCs.get(channelId);
  if (!data) return false;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return false;

  await channel.permissionOverwrites.delete(member.id);

  if (member.voice?.channelId === channelId) {
    const lobby = guild.channels.cache.get(LOBBY_VC_ID);
    if (lobby) await member.voice.setChannel(lobby);
    else await member.voice.disconnect();
  }

  data.members.delete(member.id);

  const channel2 = guild.channels.cache.get(channelId);
  if (channel2 && channel2.members.size === 0) {
    startIdleTimer(channelId, guild);
  }

  return true;
}

/** Force-delete a VC by channelId — pushes any live members to lobby first. */
export async function forceDeleteVC(channelId, guild) {
  return destroyVC(channelId, guild);
}

export function onMemberLeft(channelId, guild) {
  if (!activeVCs.has(channelId)) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.members.size === 0) {
    startIdleTimer(channelId, guild);
  }
}

export function onMemberJoined(channelId) {
  if (!activeVCs.has(channelId)) return;
  stopIdleTimer(channelId);
}

/**
 * Returns a serialisable list of all active private VCs.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @returns {Array} The list of active VCs.
 */
export function listAllVCs(guild) {
  const result = [];
  for (const [channelId, data] of activeVCs) {
    const channel = guild?.channels.cache.get(channelId);
    const members = [];
    for (const userId of data.members) {
      const member = guild?.members.cache.get(userId);
      if (member) {
        members.push({
          id: userId,
          username: member.user.username,
          displayName: member.displayName,
          avatar: member.user.displayAvatarURL({ size: 64 }),
          inVC: member.voice?.channelId === channelId,
        });
      }
    }
    const creator = guild?.members.cache.get(data.creatorId);
    result.push({
      channelId,
      name: channel?.name ?? `Private VC ${toRoman(data.index)}`,
      index: data.index,
      memberCount: channel?.members.size ?? 0,
      members,
      creatorId: data.creatorId ?? null,
      creatorName: creator?.displayName ?? creator?.user.username ?? null,
      creatorAvatar: creator?.user.displayAvatarURL({ size: 64 }) ?? null,
    });
  }
  return result;
}
