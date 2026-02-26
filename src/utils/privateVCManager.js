import { ChannelType, PermissionFlagsBits } from "discord.js";
import config from "../../config.js";

const ROMAN = ["I", "II", "III", "IV", "V"];
function toRoman(n) {
  return ROMAN[n - 1] ?? String(n);
}

const activeVCs = new Map();
let highestIndex = 0;

const {
  categoryId: CATEGORY_ID,
  lobbyVCId: LOBBY_VC_ID,
  maxSimultaneous: MAX_VCS,
  idleTimeoutMs: IDLE_MS,
  maxLifetimeMs: MAX_MS,
} = config.privateVC;

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

async function destroyVC(channelId, guild) {
  const data = activeVCs.get(channelId);
  if (!data) return;

  clearTimeout(data.idleTimer);
  clearTimeout(data.maxTimer);

  const channel = guild.channels.cache.get(channelId);
  if (channel) {
    const lobby = guild.channels.cache.get(LOBBY_VC_ID);
    if (lobby) {
      for (const [, member] of channel.members) {
        await member.voice.setChannel(lobby).catch(() => {});
      }
    }
    await channel.delete().catch(() => {});
  }

  activeVCs.delete(channelId);

  if (activeVCs.size === 0) highestIndex = 0;
}

function startIdleTimer(channelId, guild) {
  const data = activeVCs.get(channelId);
  if (!data) return;
  clearTimeout(data.idleTimer);
  data.idleTimer = setTimeout(() => destroyVC(channelId, guild), IDLE_MS);
}

function stopIdleTimer(channelId) {
  const data = activeVCs.get(channelId);
  if (!data) return;
  clearTimeout(data.idleTimer);
  data.idleTimer = null;
}

export function canCreate() {
  return activeVCs.size < MAX_VCS;
}

export function activeCount() {
  return activeVCs.size;
}

export function isPrivateVC(channelId) {
  return activeVCs.has(channelId);
}

export function getVCData(channelId) {
  return activeVCs.get(channelId);
}

export function getVCByMember(userId) {
  for (const [channelId, data] of activeVCs) {
    if (data.members.has(userId)) return channelId;
  }
  return null;
}

/** Create a new private VC. members = array of GuildMember (invoker included). */
export async function createPrivateVC(guild, members) {
  if (activeVCs.size >= MAX_VCS) return null;

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

  const memberSet = new Set(members.map((m) => m.id));

  const maxTimer = setTimeout(() => destroyVC(channel.id, guild), MAX_MS);

  activeVCs.set(channel.id, {
    members: memberSet,
    index,
    idleTimer: null,
    maxTimer,
  });

  for (const member of members) {
    if (member.voice?.channel) {
      await member.voice.setChannel(channel).catch(() => {});
    }
  }

  startIdleTimer(channel.id, guild);

  return channel;
}

export async function addMember(channelId, member, guild) {
  const data = activeVCs.get(channelId);
  if (!data) return false;

  data.members.add(member.id);

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
    await member.voice.setChannel(channel).catch(() => {});
  }

  return true;
}

export async function removeMember(channelId, member, guild) {
  const data = activeVCs.get(channelId);
  if (!data) return false;

  data.members.delete(member.id);

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return false;

  await channel.permissionOverwrites.delete(member.id).catch(() => {});

  if (member.voice?.channelId === channelId) {
    const lobby = guild.channels.cache.get(LOBBY_VC_ID);
    if (lobby) await member.voice.setChannel(lobby).catch(() => {});
    else await member.voice.disconnect().catch(() => {});
  }

  const channel2 = guild.channels.cache.get(channelId);
  if (channel2 && channel2.members.size === 0) {
    startIdleTimer(channelId, guild);
  }

  return true;
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
