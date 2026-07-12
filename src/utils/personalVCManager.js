import {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import { icon } from "./icons.js";

const TRIGGER_CHANNEL_ID = "1525798303760121877";
const MAX_MEMBERS = 10;
const IDLE_TIMEOUT = 15 * 60 * 1000;
const MAX_LIFETIME = 3 * 60 * 60 * 1000;
const LOBBY_VC = "1473075469028167817";

const VC_EMOJIS = [
  "🍞","🥐","🥖","🫓","🥨","🥯","🥞","🧇","🧀","🍖","🍗","🥩","🥓","🍔","🍟","🍕","🌭","🥪","🌮","🌯",
  "🫔","🥙","🧆","🥚","🍳","🥘","🍲","🫕","🥣","🥗","🍿","🧈","🧂","🥫","🍝","🍱","🍘","🍙","🍚","🍛",
  "🍜","🍠","🍢","🍣","🍤","🍥","🥮","🍡","🥟","🥠","🥡",
];
let vcCounter = 0;

const activePersonalVCs = new Map();

function getVC(channelId) {
  return activePersonalVCs.get(channelId);
}

export function isPersonalVC(channelId) {
  return activePersonalVCs.has(channelId);
}

export function isTriggerChannel(channelId) {
  return channelId === TRIGGER_CHANNEL_ID;
}

function buildControlEmbed(vc, channel) {
  const memberCount = channel.members?.size || 0;
  const lockStatus = vc.locked ? "Locked" : "Unlocked";
  const lockEmoji = vc.locked ? "🔒" : "🔓";
  const bannedList = vc.banned.size > 0
    ? [...vc.banned].map((id) => `<@${id}>`).join(", ")
    : "None";

  const container = new ContainerBuilder().setAccentColor(0x5865f2);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${icon("VOICE")} **${channel.name}** — <@${vc.ownerId}>'s Room`
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${lockEmoji} **Status:** ${lockStatus}\n` +
      `${icon("MEMBERS")} **Members:** ${memberCount} / ${MAX_MEMBERS}\n` +
      `${icon("STOP")} **Banned:** ${bannedList}`
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${icon("INFO")} Only <@${vc.ownerId}> can use these controls.`
    ),
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("pvc_lock")
      .setLabel(vc.locked ? "Unlock" : "Lock")
      .setEmoji(vc.locked ? "🔓" : "🔒")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("pvc_ban")
      .setLabel("Ban")
      .setEmoji(icon("STOP"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("pvc_unban")
      .setLabel("Unban")
      .setEmoji(icon("SUCCESS"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("pvc_close")
      .setLabel("Close")
      .setEmoji(icon("KEYLOCK"))
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    components: [container, row1],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function sendOrUpdatePanel(channel) {
  const vc = getVC(channel.id);
  if (!vc) return;

  const payload = buildControlEmbed(vc, channel);

  if (vc.panelMessage) {
    try {
      await vc.panelMessage.edit(payload);
      return;
    } catch {}
  }

  try {
    vc.panelMessage = await channel.send(payload);
  } catch (err) {
    console.error("[PersonalVC] Failed to send panel:", err.message);
  }
}

export async function initPersonalVC(client) {
  try {
    const guild = client.guilds.cache.first();
    const emoji = guild?.emojis.cache.find((e) => e.name === "iconBlueArrowAnimated");
    const arrow = emoji ? `<a:iconBlueArrowAnimated:${emoji.id}>` : "»";
    await client.rest.put(`/channels/${TRIGGER_CHANNEL_ID}/voice-status`, {
      body: { status: `${arrow} Join to create a personal VC` },
    });
    console.log("[PersonalVC] Set trigger channel status");
  } catch (err) {
    console.error("[PersonalVC] Failed to set trigger status:", err.message);
  }
}

export async function createPersonalVC(member, guild) {
  const existing = [...activePersonalVCs.values()].find(
    (v) => v.ownerId === member.id,
  );
  if (existing) {
    try { await member.voice.setChannel(null); } catch {}
    return null;
  }

  const triggerChannel = guild.channels.cache.get(TRIGGER_CHANNEL_ID);
  const parentId = triggerChannel?.parentId;

  const emoji = VC_EMOJIS[Math.floor(Math.random() * VC_EMOJIS.length)];
  vcCounter++;

  const channel = await guild.channels.create({
    name: `${emoji}〢・ᴠᴄ ${vcCounter}`,
    type: ChannelType.GuildVoice,
    parent: parentId,
    userLimit: MAX_MEMBERS,
    permissionOverwrites: [
      {
        id: guild.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
    ],
  });

  const vc = {
    channelId: channel.id,
    ownerId: member.id,
    locked: false,
    banned: new Set(),
    panelMessage: null,
    idleTimer: null,
    maxTimer: null,
    createdAt: Date.now(),
  };

  activePersonalVCs.set(channel.id, vc);

  vc.maxTimer = setTimeout(() => destroyPersonalVC(channel.id, guild), MAX_LIFETIME);
  startIdleTimer(channel.id, guild);

  try {
    await member.voice.setChannel(channel);
  } catch {
    await channel.delete().catch(() => {});
    activePersonalVCs.delete(channel.id);
    return null;
  }

  stopIdleTimer(channel.id);
  await sendOrUpdatePanel(channel);

  console.log(`[PersonalVC] Created "${channel.name}" for ${member.user.tag}`);
  return channel;
}

export async function destroyPersonalVC(channelId, guild) {
  const vc = activePersonalVCs.get(channelId);
  if (!vc) return;
  activePersonalVCs.delete(channelId);

  clearTimeout(vc.idleTimer);
  clearTimeout(vc.maxTimer);

  try {
    const channel = guild.channels.cache.get(channelId);
    if (channel) {
      const lobby = guild.channels.cache.get(LOBBY_VC);
      for (const [, m] of channel.members) {
        try { await m.voice.setChannel(lobby); } catch {}
      }
      await channel.delete();
    }
  } catch (err) {
    console.error("[PersonalVC] Destroy error:", err.message);
  }

  console.log(`[PersonalVC] Destroyed ${channelId}`);
}

function startIdleTimer(channelId, guild) {
  const vc = getVC(channelId);
  if (!vc) return;
  clearTimeout(vc.idleTimer);
  vc.idleTimer = setTimeout(() => {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.members.size === 0) {
      destroyPersonalVC(channelId, guild);
    }
  }, IDLE_TIMEOUT);
}

function stopIdleTimer(channelId) {
  const vc = getVC(channelId);
  if (!vc) return;
  clearTimeout(vc.idleTimer);
  vc.idleTimer = null;
}

export function onPersonalVCJoin(channelId) {
  stopIdleTimer(channelId);
}

export function onPersonalVCLeave(channelId, guild, memberId) {
  const vc = getVC(channelId);
  if (!vc) return;

  if (memberId === vc.ownerId) {
    destroyPersonalVC(channelId, guild);
    return;
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.members.size === 0) {
    startIdleTimer(channelId, guild);
  }
}

async function toggleLock(interaction) {
  const vc = getVC(interaction.channelId);
  if (!vc) return;

  vc.locked = !vc.locked;
  const channel = interaction.channel;

  await channel.permissionOverwrites.edit(interaction.guild.id, {
    Connect: vc.locked ? false : true,
  });

  await interaction.reply({
    content: vc.locked
      ? `${icon("LOCK")} VC is now **locked**. No one can join.`
      : `${icon("UNLOCK")} VC is now **unlocked**. Anyone can join.`,
    flags: 64,
  });

  await sendOrUpdatePanel(channel);
}

async function banFromVC(interaction) {
  const vc = getVC(interaction.channelId);
  if (!vc) return;

  const members = interaction.channel.members.filter(
    (m) => m.id !== vc.ownerId && !m.user.bot,
  );

  if (members.size === 0) {
    return interaction.reply({ content: `${icon("ERROR")} No members to ban.`, flags: 64 });
  }

  const { StringSelectMenuBuilder } = await import("discord.js");
  const menu = new StringSelectMenuBuilder()
    .setCustomId("pvc_ban_select")
    .setPlaceholder("Select member to ban")
    .addOptions(
      members.map((m) => ({
        label: m.displayName,
        value: m.id,
        description: m.user.tag,
      })),
    );

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.reply({ components: [row], flags: 64 });
}

async function handleBanSelect(interaction) {
  const vc = getVC(interaction.channelId);
  if (!vc || interaction.user.id !== vc.ownerId) return;

  const targetId = interaction.values[0];
  vc.banned.add(targetId);

  const channel = interaction.channel;
  await channel.permissionOverwrites.edit(targetId, {
    Connect: false,
    ViewChannel: false,
  });

  const target = interaction.guild.members.cache.get(targetId);
  if (target?.voice?.channelId === channel.id) {
    const lobby = interaction.guild.channels.cache.get(LOBBY_VC);
    try { await target.voice.setChannel(lobby); } catch {}
  }

  await interaction.update({
    content: `${icon("SUCCESS")} Banned **${target?.displayName || targetId}** from this VC.`,
    components: [],
  });

  await sendOrUpdatePanel(channel);
}

async function unbanFromVC(interaction) {
  const vc = getVC(interaction.channelId);
  if (!vc) return;

  if (vc.banned.size === 0) {
    return interaction.reply({ content: `${icon("ERROR")} No banned members.`, flags: 64 });
  }

  const { StringSelectMenuBuilder } = await import("discord.js");
  const options = [];
  for (const id of vc.banned) {
    const m = interaction.guild.members.cache.get(id);
    options.push({
      label: m?.displayName || id,
      value: id,
      description: m?.user?.tag || "Unknown",
    });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("pvc_unban_select")
    .setPlaceholder("Select member to unban")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.reply({ components: [row], flags: 64 });
}

async function handleUnbanSelect(interaction) {
  const vc = getVC(interaction.channelId);
  if (!vc || interaction.user.id !== vc.ownerId) return;

  const targetId = interaction.values[0];
  vc.banned.delete(targetId);

  const channel = interaction.channel;
  await channel.permissionOverwrites.delete(targetId).catch(() => {});

  const target = interaction.guild.members.cache.get(targetId);
  await interaction.update({
    content: `${icon("SUCCESS")} Unbanned **${target?.displayName || targetId}**.`,
    components: [],
  });

  await sendOrUpdatePanel(channel);
}

async function closeVC(interaction) {
  const vc = getVC(interaction.channelId);
  if (!vc) return;

  await interaction.reply({ content: `${icon("SUCCESS")} Closing VC...`, flags: 64 });
  await destroyPersonalVC(interaction.channelId, interaction.guild);
}

export async function handlePersonalVCButton(interaction) {
  const vc = getVC(interaction.channelId);
  if (!vc) {
    return interaction.reply({ content: `${icon("ERROR")} This is not an active personal VC.`, flags: 64 });
  }

  if (interaction.user.id !== vc.ownerId) {
    return interaction.reply({ content: `${icon("ERROR")} Only the VC owner can use these controls.`, flags: 64 });
  }

  switch (interaction.customId) {
    case "pvc_lock": return toggleLock(interaction);
    case "pvc_ban": return banFromVC(interaction);
    case "pvc_unban": return unbanFromVC(interaction);
    case "pvc_close": return closeVC(interaction);
    default: return;
  }
}

export async function handlePersonalVCSelect(interaction) {
  const vc = getVC(interaction.channelId);
  if (!vc || interaction.user.id !== vc.ownerId) {
    return interaction.reply({ content: `${icon("ERROR")} Only the VC owner can do this.`, flags: 64 });
  }

  switch (interaction.customId) {
    case "pvc_ban_select": return handleBanSelect(interaction);
    case "pvc_unban_select": return handleUnbanSelect(interaction);
    default: return;
  }
}
