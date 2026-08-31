import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { SectionBuilder, ThumbnailBuilder } from "discord.js";
import config from "../../config.js";
import { updateConfig, loadConfig } from "../utils/automodManager.js";
import {
  checkModerationPermission,
  timeout,
  removeTimeout,
  voiceMute,
  voiceUnmute,
  voiceDeafen,
  voiceUndeafen,
  kick,
  ban,
  unban,
  checkActorCanModerateTarget,
  checkModeratorCooldown,
} from "../utils/moderation.js";
import purge from "../commands/purge.js";
import refresh from "../commands/refresh.js";
import { eReply, addFooter } from "../utils/embed.js";
import {
  canCreate,
  createPrivateVC,
  getVCByMember,
  getVCData,
  getVCByCreator,
  addMember,
  removeMember,
  listAllVCs,
  forceDeleteVC,
  isVCCreator,
  isOwner,
  canManageVC,
} from "../utils/privateVCManager.js";
import { icon } from "../utils/icons.js";

export function getBotCmdChannel(client) {
  const channelId = config.botCmdChannelId;
  return client.channels.cache.get(channelId);
}

const tempSelections = new Map();

setInterval(
  () => {
    const now = Date.now();
    for (const [key, data] of tempSelections.entries()) {
      if (now - data.timestamp > 15 * 60 * 1000) {
        tempSelections.delete(key);
      }
    }
  },
  15 * 60 * 1000,
).unref();

function setTempSelection(key, value) {
  tempSelections.set(key, { value, timestamp: Date.now() });
}

function getTempSelection(key) {
  return tempSelections.get(key)?.value;
}

function formatDashboardError(err, fallback = "Action failed.") {
  if (!err) return fallback;
  const details = [];
  if (err.code) details.push(`Discord code ${err.code}`);
  if (err.message) details.push(err.message);
  return details.length ? details.join(": ") : fallback;
}

export async function buildDashboardContainer(member) {
  const guild = member.guild;

  const automodConfig = await loadConfig();
  const automodOn = automodConfig.enabled;
  const spamOn = automodConfig.spam;
  const raidOn = automodConfig.raid;
  const toxicityOn = automodConfig.toxicity;
  const onOff = (v) => (v ? "ON" : "OFF");

  const container = new ContainerBuilder().setAccentColor(0x00ced1);
  const iconUrl = guild.iconURL({ dynamic: true, size: 256 });
  const headerContent = `## ${icon("KEYLOCK")} Control Center\nManage Private Voice Channels, Auto-Moderations, and Administrative actions below.`;

  if (iconUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(headerContent),
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerContent),
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${icon("VOICE")} Voice Manager\nCreate and manage your private voice channels.`,
    ),
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_vc_create")
        .setLabel("Create")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_vc_add")
        .setLabel("Add")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_vc_remove")
        .setLabel("Remove")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_vc_delete")
        .setLabel("Delete")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("shantha_vc_leave")
        .setLabel("Leave")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${icon("BOT")} AutoMOD\n**Master :** ${onOff(automodOn)} • **Spam :** ${onOff(spamOn)} • **Raid :** ${onOff(raidOn)} • **Toxicity :** ${onOff(toxicityOn)}`,
    ),
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_automod_master")
        .setLabel(`Automod: ${onOff(automodOn)}`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_limits")
        .setLabel("Edit Limits")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_spam")
        .setLabel(`Spam: ${onOff(spamOn)}`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_raid")
        .setLabel(`Raid: ${onOff(raidOn)}`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_toxicity")
        .setLabel(`Toxicity: ${onOff(toxicityOn)}`)
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${icon("PURGE")} Purge\nPurge messages and manage server content.`,
    ),
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_purge_all")
        .setLabel("Purge All")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_purge_user")
        .setLabel("Purge User")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_purge_trail")
        .setLabel("Purge Trail")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_purge_trail_user")
        .setLabel("Purge Trail User")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### ${icon("CHANNELS")} System\nStatus and moderation tools.`,
    ),
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_mod_timeout")
        .setLabel("Timeout")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_mod_remtimeout")
        .setLabel("Remove Timeout")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_mod_mute")
        .setLabel("Mute")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_mod_unmute")
        .setLabel("Unmute")
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_mod_deafen")
        .setLabel("Deafen")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_mod_undeafen")
        .setLabel("Undeafen")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_mod_kick")
        .setLabel("Kick")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("shantha_mod_ban")
        .setLabel("Ban")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("shantha_mod_unban")
        .setLabel("Unban")
        .setStyle(ButtonStyle.Success),
    ),
  );

  addFooter(container);
  return container;
}

function parseIdFromMention(value, pattern) {
  const match = value.match(pattern);
  return match ? match[1] : null;
}

async function resolveMemberFromInput(guild, value) {
  const mentionId = parseIdFromMention(value, /^<@!?([0-9]+)>$/);
  if (mentionId) return guild.members.fetch(mentionId).catch(() => null);
  if (/^[0-9]{17,20}$/.test(value))
    return guild.members.fetch(value).catch(() => null);
  const [name, discrim] = value.split("#");
  if (name && discrim) {
    return guild.members.cache.find(
      (m) => m.user.username === name && m.user.discriminator === discrim,
    );
  }
  return null;
}

function resolveChannelFromInput(guild, value) {
  const mentionId = parseIdFromMention(value, /^<#([0-9]+)>$/);
  if (mentionId) return guild.channels.cache.get(mentionId) || null;
  if (/^[0-9]{17,20}$/.test(value))
    return guild.channels.cache.get(value) || null;
  return null;
}

export async function getDashboardComponents(_member) {
  return [];
}

export async function showPurgeModal(interaction, customId, title, fields) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  fields.forEach((f) => {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(f.customId)
          .setLabel(f.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(f.required !== false),
      ),
    );
  });
  return interaction.showModal(modal);
}

export async function showSelectWithConfirm(
  interaction,
  title,
  description,
  selectId,
  confirmId,
  confirmLabel,
  maxValues = 1,
  minValues = 1,
) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(selectId)
    .setPlaceholder("Select users...")
    .setMinValues(minValues)
    .setMaxValues(maxValues);

  const row = new ActionRowBuilder().addComponents(select);
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel(confirmLabel)
      .setStyle(ButtonStyle.Primary),
  );

  const container = new ContainerBuilder().setAccentColor(0x00ced1);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${title}**\n${description}`),
  );
  container.addActionRowComponents(row);
  container.addActionRowComponents(confirmRow);
  addFooter(container);

  await interaction.reply({
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

const FILTERED_MOD_ACTIONS = new Set([
  "shantha_mod_remtimeout",
  "shantha_mod_unmute",
  "shantha_mod_undeafen",
  "shantha_mod_mute",
  "shantha_mod_deafen",
  "shantha_mod_unban",
]);

const MOD_EMPTY_STATE = {
  shantha_mod_remtimeout: "No members currently have an active timeout.",
  shantha_mod_unmute: "No members are currently server-muted in voice.",
  shantha_mod_undeafen: "No members are currently server-deafened in voice.",
  shantha_mod_mute: "No unmuted members are currently in a voice channel.",
  shantha_mod_deafen: "No undeafened members are currently in a voice channel.",
  shantha_mod_unban: "There are no banned users to unban.",
};

async function getModerationTargets(guild, action) {
  if (action === "shantha_mod_unban") {
    const bans = await guild.bans.fetch().catch(() => null);
    if (!bans) return [];
    return [...bans.values()].slice(0, 25).map((b) => ({
      label: (b.user?.tag ?? b.user?.id ?? "Unknown").slice(0, 100),
      value: b.user.id,
      description: (b.reason
        ? `Reason: ${b.reason}`
        : "No reason recorded"
      ).slice(0, 100),
    }));
  }

  const predicates = {
    shantha_mod_remtimeout: (m) => m.isCommunicationDisabled(),
    shantha_mod_unmute: (m) => !!m.voice?.channelId && m.voice.serverMute,
    shantha_mod_undeafen: (m) => !!m.voice?.channelId && m.voice.serverDeaf,
    shantha_mod_mute: (m) =>
      !!m.voice?.channelId && !m.voice.serverMute && !m.user.bot,
    shantha_mod_deafen: (m) =>
      !!m.voice?.channelId && !m.voice.serverDeaf && !m.user.bot,
  };
  const predicate = predicates[action];
  if (!predicate) return [];
  return guild.members.cache
    .filter(predicate)
    .map((m) => ({
      label: m.displayName.slice(0, 100),
      value: m.id,
      description: m.user.username.slice(0, 100),
    }))
    .slice(0, 25);
}

async function showFilteredMemberSelect(
  interaction,
  action,
  title,
  description,
) {
  const options = await getModerationTargets(interaction.guild, action);
  if (!options.length) {
    return interaction.reply(
      eReply(
        "Nothing to do",
        MOD_EMPTY_STATE[action] || "No applicable members.",
      ),
    );
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${action}_select`)
    .setPlaceholder("Select a member...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const container = new ContainerBuilder().setAccentColor(0x00ced1);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${title}**\n${description}`),
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(select),
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${action}_confirm`)
        .setLabel("Confirm")
        .setStyle(
          action === "shantha_mod_unban"
            ? ButtonStyle.Danger
            : ButtonStyle.Primary,
        ),
    ),
  );
  addFooter(container);
  return interaction.reply({
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

async function showVCMemberSelectWithConfirm(
  interaction,
  channelId,
  title,
  description,
  selectId,
  confirmId,
  confirmLabel,
) {
  const vcData = getVCData(channelId);
  if (!vcData) {
    return interaction.reply(
      eReply("Not found", "Private VC no longer exists."),
    );
  }

  const options = [];
  for (const userId of vcData.members) {
    const member = await interaction.guild.members
      .fetch(userId)
      .catch(() => null);
    if (!member) continue;
    options.push({
      label: member.displayName.slice(0, 100),
      value: member.id,
      description: member.user.username.slice(0, 100),
    });
  }

  if (!options.length) {
    return interaction.reply(
      eReply("Not found", "This private VC has no removable members."),
    );
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(selectId)
    .setPlaceholder("Select a member...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options.slice(0, 25));

  const container = new ContainerBuilder().setAccentColor(0x00ced1);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${title}**\n${description}`),
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(select),
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(confirmLabel)
        .setStyle(ButtonStyle.Danger),
    ),
  );
  addFooter(container);

  return interaction.reply({
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

async function showVCDeleteConfirm(interaction, channelId, title, description) {
  const vcData = getVCData(channelId);
  if (!vcData) {
    return interaction.reply(
      eReply("Not found", "Private VC no longer exists."),
    );
  }

  const channel = interaction.guild.channels.cache.get(channelId);
  const container = new ContainerBuilder().setAccentColor(0xff5555);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**${title}**\n${description}\n\nSelected: **${channel?.name ?? "Private VC"}**`,
    ),
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_vc_delete_confirm")
        .setLabel("Confirm Delete")
        .setStyle(ButtonStyle.Danger),
    ),
  );
  addFooter(container);
  setTempSelection(`${interaction.user.id}_delete_channel`, channelId);

  return interaction.reply({
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

async function showOwnerVCSelect(
  interaction,
  title,
  description,
  selectId,
  confirmLabel,
) {
  const vcs = listAllVCs(interaction.guild);
  if (!vcs.length) {
    return interaction.reply(
      eReply("Not found", "There are no active private VCs."),
    );
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(selectId)
    .setPlaceholder("Select a private VC...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      vcs.slice(0, 25).map((vc) => ({
        label: vc.name.slice(0, 100),
        value: vc.channelId,
        description: `Creator: ${(vc.creatorName ?? "Unknown").slice(0, 80)}`,
      })),
    );

  const vcList = vcs
    .slice(0, 10)
    .map(
      (vc, index) =>
        `${index + 1}. **${vc.name}** — Creator: ${vc.creatorName ?? "Unknown"} — Members: ${vc.members.length}`,
    )
    .join("\n");

  const container = new ContainerBuilder().setAccentColor(0x00ced1);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**${title}**\n${description}\n\n${vcList}`,
    ),
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(select),
  );
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(selectId.replace("_select", "_confirm"))
        .setLabel(confirmLabel)
        .setStyle(ButtonStyle.Primary),
    ),
  );
  addFooter(container);

  return interaction.reply({
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}

export async function handleDashboardSelect(interaction) {
  if (!interaction.isUserSelectMenu() && !interaction.isStringSelectMenu())
    return;
  if (
    [
      "shantha_private_vc_select",
      "shantha_vc_add_select",
      "shantha_vc_remove_select",
      "shantha_owner_vc_remove_select",
      "shantha_owner_vc_delete_select",
      "shantha_purge_user_select",
      "shantha_purge_trail_user_select",
      "shantha_mod_timeout_select",
      "shantha_mod_remtimeout_select",
      "shantha_mod_mute_select",
      "shantha_mod_unmute_select",
      "shantha_mod_deafen_select",
      "shantha_mod_undeafen_select",
      "shantha_mod_kick_select",
      "shantha_mod_ban_select",
      "shantha_mod_unban_select",
    ].includes(interaction.customId)
  ) {
    setTempSelection(
      `${interaction.user.id}_${interaction.customId}`,
      interaction.values,
    );
    return interaction.deferUpdate();
  }

  return interaction.reply(
    eReply(
      "Notice",
      "This dashboard selection is no longer available. Please use the latest Control Center message.",
    ),
  );
}

async function buildDashboardPayload(member) {
  const container = await buildDashboardContainer(member);
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

export async function postDashboard(client) {
  const channel = getBotCmdChannel(client);
  if (!channel) return;
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find((m) => {
    if (m.author.id !== client.user.id) return false;
    if (m.embeds[0]?.title?.includes("Shantha Bot Command Center")) return true;
    if (m.embeds[0]?.title?.includes("Shantha Control Center")) return true;
    const flat = JSON.stringify(m.components ?? []);
    return (
      flat.includes("Control Center") || flat.includes("shantha_vc_create")
    );
  });
  const dashboardMember =
    channel.guild.members.me ?? (await channel.guild.members.fetchMe());
  const payload = await buildDashboardPayload(dashboardMember);
  if (existing) {
    const isLegacy = !!existing.embeds[0]?.title;
    if (isLegacy) {
      await existing.delete().catch(() => {});
      await channel
        .send(payload)
        .catch((err) =>
          console.error("[Dashboard] Failed to send new dashboard:", err),
        );
    } else {
      await existing
        .edit(payload)
        .catch((err) =>
          console.error("[Dashboard] Failed to edit existing dashboard:", err),
        );
    }
  } else {
    await channel
      .send(payload)
      .catch((err) =>
        console.error("[Dashboard] Failed to send dashboard:", err),
      );
  }
}

export async function handleDashboardInteraction(interaction) {
  if (!interaction.isButton()) return;
  const { member } = interaction;
  switch (interaction.customId) {
    case "shantha_vc_create": {
      if (
        getVCByMember(interaction.user.id) ||
        getVCByCreator(interaction.user.id)
      )
        return interaction.reply(
          eReply(
            "Already active",
            "You already have an active private VC. Delete it or leave your current one before creating a new one.",
          ),
        );
      if (!canCreate())
        return interaction.reply(
          eReply(
            "Limit reached",
            "Maximum private VCs are already active. Wait for one to end.",
          ),
        );
      return showSelectWithConfirm(
        interaction,
        "Create Private VC",
        "Select up to 5 members to invite using the dropdown below, then click Create.",
        "shantha_private_vc_select",
        "shantha_private_vc_confirm",
        "Create VC",
        5,
        0,
      );
    }
    case "shantha_vc_add": {
      const addChannelId = getVCByCreator(interaction.user.id);
      if (!addChannelId)
        return interaction.reply(
          eReply("Not found", "You have not created a private VC."),
        );
      return showSelectWithConfirm(
        interaction,
        "Add Member",
        "Select a member from the dropdown, then click Add.",
        "shantha_vc_add_select",
        "shantha_vc_add_confirm",
        "Add Member",
        1,
      );
    }
    case "shantha_vc_remove": {
      if (isOwner(member)) {
        return showOwnerVCSelect(
          interaction,
          "Remove Member",
          "Select a private VC first, then choose the member to remove.",
          "shantha_owner_vc_remove_select",
          "Select VC",
        );
      }
      const removeChannelId = getVCByCreator(interaction.user.id);
      if (!removeChannelId)
        return interaction.reply(
          eReply("Not found", "You have not created a private VC."),
        );
      return showVCMemberSelectWithConfirm(
        interaction,
        removeChannelId,
        "Remove Member",
        "Select a member from your private VC, then click Remove Member.",
        "shantha_vc_remove_select",
        "shantha_vc_remove_confirm",
        "Remove Member",
      );
    }
    case "shantha_vc_delete": {
      if (isOwner(member)) {
        return showOwnerVCSelect(
          interaction,
          "Delete Private VC",
          "Select the private VC to delete.",
          "shantha_owner_vc_delete_select",
          "Review Delete",
        );
      }
      const deleteChannelId = getVCByCreator(interaction.user.id);
      if (!deleteChannelId)
        return interaction.reply(
          eReply("Not found", "You have not created a private VC."),
        );
      return showVCDeleteConfirm(
        interaction,
        deleteChannelId,
        "Delete Private VC",
        "Click Confirm Delete below to delete the private VC you created.",
      );
    }
    case "shantha_vc_leave": {
      const leaveChannelId = getVCByMember(interaction.user.id);
      if (!leaveChannelId) {
        return interaction.reply(
          eReply("Not found", "You are not in a private VC."),
        );
      }
      try {
        await removeMember(
          leaveChannelId,
          interaction.member,
          interaction.guild,
        );
        return interaction.reply(
          eReply("Left VC", "You have left your private VC."),
        );
      } catch (err) {
        console.error("[VC Leave]", err);
        return interaction.reply(
          eReply("Error", formatDashboardError(err, "Failed to leave the VC.")),
        );
      }
    }
    case "shantha_automod_master":
    case "shantha_automod_limits":
    case "shantha_automod_spam":
    case "shantha_automod_raid":
    case "shantha_automod_toxicity": {
      const isLimitsAction = interaction.customId === "shantha_automod_limits";
      const requiredLevel = isLimitsAction ? "mod" : "owner";
      if (
        !(await checkModerationPermission(
          interaction.guild,
          interaction.user.id,
          requiredLevel,
        ))
      ) {
        return interaction.reply(
          eReply(
            "Access denied",
            isLimitsAction
              ? "Only moderators can edit automod limits."
              : "Only the owner can toggle automod.",
          ),
        );
      }
      const current = await loadConfig();
      if (interaction.customId === "shantha_automod_master") {
        await updateConfig({ enabled: !current.enabled });
      } else if (interaction.customId === "shantha_automod_spam") {
        await updateConfig({ spam: !current.spam });
      } else if (interaction.customId === "shantha_automod_raid") {
        await updateConfig({ raid: !current.raid });
      } else if (interaction.customId === "shantha_automod_toxicity") {
        await updateConfig({ toxicity: !current.toxicity });
      } else if (interaction.customId === "shantha_automod_limits") {
        const modal = new ModalBuilder()
          .setCustomId("shantha_automod_limits_modal")
          .setTitle("Rate Limits (per 10s)");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("limit_msg")
              .setLabel("Max messages")
              .setStyle(TextInputStyle.Short)
              .setValue(current.limits.messageSpam.toString())
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("limit_chdel")
              .setLabel("Max channel deletes")
              .setStyle(TextInputStyle.Short)
              .setValue(current.limits.channelDelete.toString())
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("limit_nick")
              .setLabel("Max nickname changes")
              .setStyle(TextInputStyle.Short)
              .setValue(current.limits.nicknameChange.toString())
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("limit_msgdel")
              .setLabel("Max message deletes")
              .setStyle(TextInputStyle.Short)
              .setValue(current.limits.messageDelete.toString())
              .setRequired(true),
          ),
        );
        return interaction.showModal(modal);
      }
      return interaction.update(await buildDashboardPayload(member));
    }

    case "shantha_owner_vc_remove_confirm": {
      if (!isOwner(member))
        return interaction.reply(eReply("Access denied", "Owners only."));
      const cacheKey = `${interaction.user.id}_shantha_owner_vc_remove_select`;
      const values = getTempSelection(cacheKey) || [];
      if (!values.length)
        return interaction.reply(eReply("Notice", "Please select a VC first."));
      tempSelections.delete(cacheKey);
      setTempSelection(
        `${interaction.user.id}_owner_remove_channel`,
        values[0],
      );
      return showVCMemberSelectWithConfirm(
        interaction,
        values[0],
        "Remove Member",
        "Select a member from the selected private VC, then click Remove Member.",
        "shantha_vc_remove_select",
        "shantha_vc_remove_confirm",
        "Remove Member",
      );
    }
    case "shantha_owner_vc_delete_confirm": {
      if (!isOwner(member))
        return interaction.reply(eReply("Access denied", "Owners only."));
      const cacheKey = `${interaction.user.id}_shantha_owner_vc_delete_select`;
      const values = getTempSelection(cacheKey) || [];
      if (!values.length)
        return interaction.reply(eReply("Notice", "Please select a VC first."));
      tempSelections.delete(cacheKey);
      const channelId = values[0];
      return showVCDeleteConfirm(
        interaction,
        channelId,
        "Delete Private VC",
        "Click Confirm Delete below to delete the selected private VC.",
      );
    }
    case "shantha_vc_delete_confirm": {
      const channelId = getTempSelection(
        `${interaction.user.id}_delete_channel`,
      );
      tempSelections.delete(`${interaction.user.id}_delete_channel`);
      if (!channelId)
        return interaction.reply(eReply("Notice", "Please select a VC first."));
      if (!getVCData(channelId))
        return interaction.reply(
          eReply("Not found", "Private VC no longer exists."),
        );
      if (!canManageVC(channelId, interaction.member))
        return interaction.reply(
          eReply(
            "Access denied",
            "Only the VC creator or owner can delete this VC.",
          ),
        );
      try {
        await forceDeleteVC(channelId, interaction.guild);
        return interaction.reply(
          eReply("VC deleted", "The selected private VC has been deleted."),
        );
      } catch (err) {
        console.error("[VC Delete Confirm]", err);
        return interaction.reply(
          eReply("Error", formatDashboardError(err, "Failed to delete VC.")),
        );
      }
    }
    case "shantha_private_vc_confirm": {
      const createCacheKey = `${interaction.user.id}_shantha_private_vc_select`;
      const createValues = getTempSelection(createCacheKey) || [];
      tempSelections.delete(createCacheKey);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (
        getVCByMember(interaction.user.id) ||
        getVCByCreator(interaction.user.id)
      )
        return interaction.editReply(
          eReply(
            "Already active",
            "You already have an active private VC. Delete it or leave your current one before creating a new one.",
          ),
        );
      if (!canCreate())
        return interaction.editReply(
          eReply(
            "Limit reached",
            "Maximum private VCs are already active. Wait for one to end.",
          ),
        );

      const invitedIds = createValues.filter(
        (id) => id !== interaction.user.id,
      );
      const invoker = await interaction.guild.members
        .fetch(interaction.user.id)
        .catch(() => null);
      if (!invoker)
        return interaction.editReply(
          eReply("Error", "Could not resolve your member data."),
        );

      const createMembers = [invoker];
      for (const id of invitedIds) {
        const m = await interaction.guild.members.fetch(id).catch(() => null);
        if (m && !m.user.bot && !getVCByMember(m.id)) createMembers.push(m);
      }

      try {
        const channel = await createPrivateVC(interaction.guild, createMembers);
        if (!channel)
          return interaction.editReply(
            eReply("Error", "Failed to create private VC. Please try again."),
          );

        const mentions = createMembers
          .filter((m) => m.id !== interaction.user.id)
          .map((m) => `<@${m.id}>`)
          .join(", ");
        return interaction.editReply(
          eReply(
            "Private VC created",
            `**${channel.name}** is ready!\nInvited: ${mentions || "No others"}\n\nMembers not in voice will need to join manually.`,
          ),
        );
      } catch (err) {
        console.error("[VC Create]", err);
        return interaction.editReply(
          eReply("Error", formatDashboardError(err, "Failed to create VC.")),
        );
      }
    }
    case "shantha_vc_add_confirm": {
      const addCacheKey = `${interaction.user.id}_shantha_vc_add_select`;
      const addValues = getTempSelection(addCacheKey) || [];
      if (!addValues.length)
        return interaction.reply(
          eReply("Notice", "Please select 1 member first."),
        );
      tempSelections.delete(addCacheKey);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const addChannelId = getVCByCreator(interaction.user.id);
      if (!addChannelId)
        return interaction.editReply(
          eReply("Not found", "You have not created a private VC."),
        );

      const addTarget = await interaction.guild.members
        .fetch(addValues[0])
        .catch(() => null);
      if (!addTarget)
        return interaction.editReply(eReply("Not found", "Member not found."));
      if (addTarget.user.bot)
        return interaction.editReply(eReply("Invalid", "You cannot add bots."));

      const addVcData = getVCData(addChannelId);
      if (!addVcData || !isVCCreator(addChannelId, interaction.member)) {
        return interaction.editReply(
          eReply(
            "Access denied",
            "You can only add members to a VC you created.",
          ),
        );
      }
      if (addVcData.members.has(addTarget.id))
        return interaction.editReply(
          eReply("Already added", `<@${addTarget.id}> is already in this VC.`),
        );
      if (getVCByMember(addTarget.id))
        return interaction.editReply(
          eReply(
            "Unavailable",
            `<@${addTarget.id}> is already in another private VC.`,
          ),
        );

      try {
        const ok = await addMember(addChannelId, addTarget, interaction.guild);
        if (!ok)
          return interaction.editReply(
            eReply("Error", "Private VC no longer exists."),
          );
        return interaction.editReply(
          eReply(
            "Member added",
            `<@${addTarget.id}> has been added to the private VC.${addTarget.voice?.channel ? "" : " They are not in voice — they can now join manually."}`,
          ),
        );
      } catch (err) {
        console.error("[VC Add]", err);
        return interaction.editReply(
          eReply("Error", formatDashboardError(err, "Failed to add member.")),
        );
      }
    }
    case "shantha_vc_remove_confirm": {
      const removeCacheKey = `${interaction.user.id}_shantha_vc_remove_select`;
      const removeValues = getTempSelection(removeCacheKey) || [];
      if (!removeValues.length)
        return interaction.reply(
          eReply("Notice", "Please select 1 member first."),
        );
      tempSelections.delete(removeCacheKey);

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const ownerTarget = getTempSelection(
        `${interaction.user.id}_owner_remove_channel`,
      );
      const rmChannelId = ownerTarget || getVCByCreator(interaction.user.id);
      tempSelections.delete(`${interaction.user.id}_owner_remove_channel`);
      if (!rmChannelId)
        return interaction.editReply(
          eReply("Not found", "You have not created a private VC."),
        );

      const rmVcData = getVCData(rmChannelId);
      if (!rmVcData || !canManageVC(rmChannelId, interaction.member))
        return interaction.editReply(
          eReply(
            "Access denied",
            "Only the VC creator or owner can remove members.",
          ),
        );

      const rmTarget = await interaction.guild.members
        .fetch(removeValues[0])
        .catch(() => null);
      if (!rmTarget)
        return interaction.editReply(eReply("Not found", "Member not found."));
      if (!ownerTarget && rmTarget.id === interaction.user.id)
        return interaction.editReply(
          eReply("Invalid", "You cannot remove yourself. Use Leave instead."),
        );
      if (rmVcData && !rmVcData.members.has(rmTarget.id))
        return interaction.editReply(
          eReply("Not in VC", `<@${rmTarget.id}> is not in this private VC.`),
        );

      try {
        await removeMember(rmChannelId, rmTarget, interaction.guild);
        return interaction.editReply(
          eReply(
            "Member removed",
            `<@${rmTarget.id}> has been removed from the private VC.`,
          ),
        );
      } catch (err) {
        console.error("[VC Remove]", err);
        return interaction.editReply(
          eReply(
            "Error",
            formatDashboardError(err, "Failed to remove member."),
          ),
        );
      }
    }
    case "shantha_purge_user_confirm":
    case "shantha_purge_trail_user_confirm": {
      const isTrail =
        interaction.customId === "shantha_purge_trail_user_confirm";
      const selectId = isTrail
        ? "shantha_purge_trail_user_select"
        : "shantha_purge_user_select";
      const cacheKey = `${interaction.user.id}_${selectId}`;
      const values = getTempSelection(cacheKey) || [];
      if (!values.length)
        return interaction.reply(
          eReply("Notice", "Please select 1 member first."),
        );
      tempSelections.delete(cacheKey);

      const member = await interaction.guild.members
        .fetch(values[0])
        .catch(() => null);
      if (!member)
        return interaction.reply(eReply("Notice", "Member not found."));

      const targetCacheKey = `${interaction.user.id}_${isTrail ? "purge_trail_target" : "purge_user_target"}`;
      setTempSelection(targetCacheKey, { purgeUserId: member.id });

      const modalId = isTrail
        ? "shantha_purge_trail_user_modal"
        : "shantha_purge_user_modal";
      const fields = [];
      if (isTrail) {
        fields.push({
          customId: "purge_message",
          label: "Start message ID",
          required: true,
        });
        fields.push({
          customId: "purge_channel",
          label: "Channel (Optional if msg ID given)",
          required: false,
        });
      } else {
        fields.push({
          customId: "purge_channel",
          label: "Channel (#channel or ID)",
          required: true,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Purge Confirmation");
      for (const field of fields) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(field.customId)
              .setLabel(field.label)
              .setStyle(TextInputStyle.Short)
              .setRequired(field.required),
          ),
        );
      }
      return interaction.showModal(modal);
    }

    case "shantha_mod_timeout":
    case "shantha_mod_remtimeout":
    case "shantha_mod_mute":
    case "shantha_mod_unmute":
    case "shantha_mod_deafen":
    case "shantha_mod_undeafen":
    case "shantha_mod_kick":
    case "shantha_mod_unban":
    case "shantha_mod_ban": {
      const isOwnerReq =
        interaction.customId === "shantha_mod_kick" ||
        interaction.customId === "shantha_mod_ban" ||
        interaction.customId === "shantha_mod_unban";
      const isModReq = !isOwnerReq;
      const isOwner = await checkModerationPermission(
        interaction.guild,
        member.id,
        "owner",
      );
      const isMod =
        isOwner ||
        (await checkModerationPermission(interaction.guild, member.id, "mod"));
      if (isOwnerReq && !isOwner)
        return interaction.reply(
          eReply("Notice", `${icon("LOCK")} Owners only.`),
        );
      if (isModReq && !isMod)
        return interaction.reply(
          eReply("Notice", `${icon("LOCK")} Moderators only.`),
        );

      const titleMap = {
        shantha_mod_timeout: "Timeout User",
        shantha_mod_remtimeout: "Remove Timeout",
        shantha_mod_mute: "Voice Mute",
        shantha_mod_unmute: "Voice Unmute",
        shantha_mod_deafen: "Voice Deafen",
        shantha_mod_undeafen: "Voice Undeafen",
        shantha_mod_kick: "Kick User",
        shantha_mod_ban: "Ban User",
        shantha_mod_unban: "Unban User",
      };
      const descMap = {
        shantha_mod_timeout: "Select user to timeout.",
        shantha_mod_remtimeout:
          "Only members who are currently timed out are listed.",
        shantha_mod_mute:
          "Only members currently in a voice channel are listed.",
        shantha_mod_unmute: "Only members currently muted in voice are listed.",
        shantha_mod_deafen:
          "Only members currently in a voice channel are listed.",
        shantha_mod_undeafen:
          "Only members currently deafened in voice are listed.",
        shantha_mod_kick: "Select user to kick.",
        shantha_mod_ban: "Select user to ban.",
        shantha_mod_unban: "Only currently banned users are listed.",
      };

      if (FILTERED_MOD_ACTIONS.has(interaction.customId)) {
        return showFilteredMemberSelect(
          interaction,
          interaction.customId,
          titleMap[interaction.customId],
          descMap[interaction.customId],
        );
      }

      return showSelectWithConfirm(
        interaction,
        titleMap[interaction.customId],
        descMap[interaction.customId],
        `${interaction.customId}_select`,
        `${interaction.customId}_confirm`,
        "Confirm Target",
        1,
      );
    }

    case "shantha_mod_timeout_confirm":
    case "shantha_mod_remtimeout_confirm":
    case "shantha_mod_mute_confirm":
    case "shantha_mod_unmute_confirm":
    case "shantha_mod_deafen_confirm":
    case "shantha_mod_undeafen_confirm":
    case "shantha_mod_kick_confirm":
    case "shantha_mod_unban_confirm":
    case "shantha_mod_ban_confirm": {
      const action = interaction.customId.replace("_confirm", "");
      const selectId = `${action}_select`;
      const cacheKey = `${interaction.user.id}_${selectId}`;
      const values = getTempSelection(cacheKey) || [];
      if (!values.length)
        return interaction.reply(
          eReply("Notice", "Please select 1 member first."),
        );
      tempSelections.delete(cacheKey);

      if (action === "shantha_mod_unban") {
        if (
          !(await checkModerationPermission(
            interaction.guild,
            interaction.member.id,
            "owner",
          ))
        )
          return interaction.reply(
            eReply("Notice", `${icon("LOCK")} Owners only.`),
          );
        const cd = checkModeratorCooldown(interaction.member);
        if (!cd.ok)
          return interaction.reply(
            eReply(
              "Slow down",
              `Too many moderation actions. Try again in ${Math.ceil(cd.retryMs / 1000)}s.`,
            ),
          );
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const msg = await unban(
            interaction.guild,
            values[0],
            `[Dashboard] Unbanned by ${interaction.user.tag}`,
          );
          return interaction.editReply(eReply("Success", msg));
        } catch (err) {
          console.error("[Dashboard Moderation] Unban failed:", err);
          return interaction.editReply(
            eReply("Error", formatDashboardError(err, "Failed to unban.")),
          );
        }
      }

      const member = await interaction.guild.members
        .fetch(values[0])
        .catch(() => null);
      if (!member)
        return interaction.reply(eReply("Notice", "Member not found."));

      const gate = checkActorCanModerateTarget(interaction.member, member);
      if (!gate.ok)
        return interaction.reply(
          eReply("Notice", `${icon("LOCK")} ${gate.reason}`),
        );

      setTempSelection(`${interaction.user.id}_mod_target`, member.id);

      if (action === "shantha_mod_remtimeout") {
        tempSelections.delete(`${interaction.user.id}_mod_target`);
        if (!member.isCommunicationDisabled())
          return interaction.reply(
            eReply("Notice", `${member.user.tag} is not currently timed out.`),
          );
        const cd = checkModeratorCooldown(interaction.member);
        if (!cd.ok)
          return interaction.reply(
            eReply(
              "Slow down",
              `Too many moderation actions. Try again in ${Math.ceil(cd.retryMs / 1000)}s.`,
            ),
          );
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await removeTimeout(
            member,
            `[Dashboard] Removed by ${interaction.user.tag}`,
          );
          return interaction.editReply(
            eReply("Success", `Removed timeout from ${member.user.tag}.`),
          );
        } catch (err) {
          console.error("[Dashboard Moderation] Remove timeout failed:", err);
          return interaction.editReply(
            eReply(
              "Error",
              formatDashboardError(err, "Failed to remove timeout."),
            ),
          );
        }
      }

      if (action === "shantha_mod_unmute") {
        tempSelections.delete(`${interaction.user.id}_mod_target`);
        if (!member.voice?.serverMute)
          return interaction.reply(
            eReply("Notice", `${member.user.tag} is not server-muted.`),
          );
        const cd = checkModeratorCooldown(interaction.member);
        if (!cd.ok)
          return interaction.reply(
            eReply(
              "Slow down",
              `Too many moderation actions. Try again in ${Math.ceil(cd.retryMs / 1000)}s.`,
            ),
          );
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await voiceUnmute(
            member,
            `[Dashboard] Unmuted by ${interaction.user.tag}`,
          );
          return interaction.editReply(
            eReply("Success", `Unmuted ${member.user.tag}.`),
          );
        } catch (err) {
          console.error("[Dashboard Moderation] Unmute failed:", err);
          return interaction.editReply(
            eReply("Error", formatDashboardError(err, "Failed to unmute.")),
          );
        }
      }

      if (action === "shantha_mod_undeafen") {
        tempSelections.delete(`${interaction.user.id}_mod_target`);
        if (!member.voice?.serverDeaf)
          return interaction.reply(
            eReply("Notice", `${member.user.tag} is not server-deafened.`),
          );
        const cd = checkModeratorCooldown(interaction.member);
        if (!cd.ok)
          return interaction.reply(
            eReply(
              "Slow down",
              `Too many moderation actions. Try again in ${Math.ceil(cd.retryMs / 1000)}s.`,
            ),
          );
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await voiceUndeafen(
            member,
            `[Dashboard] Undeafened by ${interaction.user.tag}`,
          );
          return interaction.editReply(
            eReply("Success", `Undeafened ${member.user.tag}.`),
          );
        } catch (err) {
          console.error("[Dashboard Moderation] Undeafen failed:", err);
          return interaction.editReply(
            eReply("Error", formatDashboardError(err, "Failed to undeafen.")),
          );
        }
      }

      const modal = new ModalBuilder()
        .setCustomId(`${action}_modal`)
        .setTitle("Moderation Action");

      if (action === "shantha_mod_timeout") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("mod_duration")
              .setLabel("Duration (minutes)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true),
          ),
        );
      }
      if (action === "shantha_mod_ban") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("mod_deletedays")
              .setLabel("Days to delete messages (0-7)")
              .setStyle(TextInputStyle.Short)
              .setValue("0")
              .setRequired(true),
          ),
        );
      }

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("mod_reason")
            .setLabel("Reason")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false),
        ),
      );
      return interaction.showModal(modal);
    }

    case "shantha_purge_all":
      if (
        !(await checkModerationPermission(
          interaction.guild,
          member.id,
          "owner",
        ))
      )
        return interaction.reply(eReply("Notice", "Owners only."));
      return showPurgeModal(
        interaction,
        "shantha_purge_all_modal",
        "Purge All Messages",
        [
          {
            customId: "purge_channel",
            label: "Channel (#channel or ID)",
            required: true,
          },
        ],
      );
    case "shantha_purge_user":
      if (
        !(await checkModerationPermission(
          interaction.guild,
          member.id,
          "owner",
        ))
      )
        return interaction.reply(eReply("Notice", "Owners only."));
      return showSelectWithConfirm(
        interaction,
        "Purge User",
        "Select the user whose messages you want to purge, then click Confirm.",
        "shantha_purge_user_select",
        "shantha_purge_user_confirm",
        "Confirm Target",
        1,
      );
    case "shantha_purge_trail":
      if (
        !(await checkModerationPermission(
          interaction.guild,
          member.id,
          "owner",
        ))
      )
        return interaction.reply(eReply("Notice", "Owners only."));
      return showPurgeModal(
        interaction,
        "shantha_purge_trail_modal",
        "Purge Trail",
        [
          {
            customId: "purge_message",
            label: "Start message ID",
            required: true,
          },
          {
            customId: "purge_channel",
            label: "Channel (Optional if msg ID given)",
            required: false,
          },
        ],
      );
    case "shantha_purge_trail_user":
      if (
        !(await checkModerationPermission(
          interaction.guild,
          member.id,
          "owner",
        ))
      )
        return interaction.reply(eReply("Notice", "Owners only."));
      return showSelectWithConfirm(
        interaction,
        "Purge From Message",
        "Select the user to purge messages from a starting message, then click Confirm.",
        "shantha_purge_trail_user_select",
        "shantha_purge_trail_user_confirm",
        "Confirm Target",
        1,
      );
    case "shantha_refresh":
      if (
        !(await checkModerationPermission(interaction.guild, member.id, "mod"))
      )
        return interaction.reply(eReply("Notice", "Moderators only."));
      return await refresh.execute(interaction);
    default:
      return interaction.reply(
        eReply(
          "Notice",
          "This dashboard action is no longer available. Please use the latest Control Center message.",
        ),
      );
  }
}

export async function handleDashboardModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId === "shantha_automod_limits_modal") {
    if (
      !(await checkModerationPermission(
        interaction.guild,
        interaction.user.id,
        "mod",
      ))
    ) {
      return interaction.reply(
        eReply("Access denied", "Only moderators can edit automod limits."),
      );
    }
    const rawMsg = parseInt(interaction.fields.getTextInputValue("limit_msg"));
    const msg = isNaN(rawMsg) ? 5 : rawMsg;
    const rawChDel = parseInt(
      interaction.fields.getTextInputValue("limit_chdel"),
    );
    const chDel = isNaN(rawChDel) ? 2 : rawChDel;
    const rawNick = parseInt(
      interaction.fields.getTextInputValue("limit_nick"),
    );
    const nick = isNaN(rawNick) ? 3 : rawNick;
    const rawMsgDel = parseInt(
      interaction.fields.getTextInputValue("limit_msgdel"),
    );
    const msgDel = isNaN(rawMsgDel) ? 3 : rawMsgDel;

    await updateConfig({
      limits: {
        messageSpam: msg,
        channelDelete: chDel,
        nicknameChange: nick,
        messageDelete: msgDel,
      },
    });
    await interaction.reply(eReply("Notice", "Automod limits updated."));
    await postDashboard(interaction.client);
    return;
  }
  if (
    interaction.customId.endsWith("_modal") &&
    interaction.customId.startsWith("shantha_mod_")
  ) {
    const action = interaction.customId.replace("_modal", "");
    const cacheKey = `${interaction.user.id}_mod_target`;
    const targetId = getTempSelection(cacheKey);
    if (!targetId)
      return interaction.reply(eReply("Error", "Target lost from cache."));
    tempSelections.delete(cacheKey);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetMember = await interaction.guild.members
      .fetch(targetId)
      .catch(() => null);
    if (!targetMember)
      return interaction.editReply(
        eReply("Error", "Target member no longer found."),
      );

    const gate = checkActorCanModerateTarget(interaction.member, targetMember);
    if (!gate.ok)
      return interaction.editReply(
        eReply("Notice", `${icon("LOCK")} ${gate.reason}`),
      );
    const cd = checkModeratorCooldown(interaction.member);
    if (!cd.ok)
      return interaction.editReply(
        eReply(
          "Slow down",
          `Too many moderation actions. Try again in ${Math.ceil(cd.retryMs / 1000)}s.`,
        ),
      );

    let reason = "No reason provided.";
    try {
      const inputReason = interaction.fields.getTextInputValue("mod_reason");
      if (inputReason) reason = inputReason;
    } catch {}

    let resultStr = "";
    try {
      switch (action) {
        case "shantha_mod_timeout": {
          const duration =
            parseInt(interaction.fields.getTextInputValue("mod_duration")) || 5;
          resultStr = await timeout(targetMember, duration, reason);
          break;
        }
        case "shantha_mod_remtimeout":
          resultStr = await removeTimeout(targetMember, reason);
          break;
        case "shantha_mod_mute":
          resultStr = await voiceMute(targetMember, reason);
          break;
        case "shantha_mod_unmute":
          resultStr = await voiceUnmute(targetMember, reason);
          break;
        case "shantha_mod_deafen":
          resultStr = await voiceDeafen(targetMember, reason);
          break;
        case "shantha_mod_undeafen":
          resultStr = await voiceUndeafen(targetMember, reason);
          break;
        case "shantha_mod_kick":
          resultStr = await kick(targetMember, reason);
          break;
        case "shantha_mod_ban": {
          const days =
            parseInt(interaction.fields.getTextInputValue("mod_deletedays")) ||
            0;
          resultStr = await ban(targetMember, days, reason);
          break;
        }
        default:
          return interaction.editReply(
            eReply("Error", "Unknown moderation action."),
          );
      }
      return interaction.editReply(eReply("Moderation Action", resultStr));
    } catch (err) {
      console.error(
        `[Dashboard Moderation] ${action} failed for ${targetMember.id}:`,
        err,
      );
      return interaction.editReply(eReply("Error", formatDashboardError(err)));
    }
  }

  if (interaction.customId.startsWith("shantha_purge_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const getVal = (id) => {
      try {
        return interaction.fields.getTextInputValue(id)?.trim();
      } catch {
        return null;
      }
    };
    const channelRaw = getVal("purge_channel");
    let channel = channelRaw
      ? resolveChannelFromInput(interaction.guild, channelRaw)
      : null;
    const messageId = getVal("purge_message");

    if (!channel && messageId) {
      for (const ch of interaction.guild.channels.cache.values()) {
        if (ch.isTextBased()) {
          try {
            const msg = await ch.messages.fetch(messageId);
            if (msg) {
              channel = ch;
              break;
            }
          } catch {
            continue;
          }
        }
      }
    }

    if (!channel) {
      return interaction.editReply(
        eReply(
          "Notice",
          "Channel not found. Please provide a valid channel or ensure the message ID exists.",
        ),
      );
    }
    const userRaw = getVal("purge_user");
    let user = userRaw
      ? await resolveMemberFromInput(interaction.guild, userRaw)
      : null;

    const isTrail = interaction.customId === "shantha_purge_trail_user_modal";
    const targetCacheKey = `${interaction.user.id}_${isTrail ? "purge_trail_target" : "purge_user_target"}`;

    if (!user && tempSelections.has(targetCacheKey)) {
      const sel = getTempSelection(targetCacheKey);
      try {
        user = await interaction.guild.members.fetch(sel.purgeUserId);
      } catch {
        user = null;
      }
      tempSelections.delete(targetCacheKey);
    }
    if (userRaw && !user) {
      return interaction.editReply(eReply("Notice", "User not found."));
    }
    const mode = {
      shantha_purge_all_modal: "all",
      shantha_purge_user_modal: "user",
      shantha_purge_trail_modal: "trail",
      shantha_purge_trail_user_modal: "trail_user",
    }[interaction.customId];
    interaction.options = {
      getChannel: () => channel,
      getString: (key) => (key === "mode" ? mode : messageId),
      getUser: () => (user ? user.user : null),
    };
    try {
      await purge.execute(interaction);
    } catch (err) {
      console.error(`[Dashboard Purge] ${interaction.customId} failed:`, err);
      return interaction.editReply(
        eReply("Error", formatDashboardError(err, "Failed to purge messages.")),
      );
    }
    return;
  }

  return interaction.reply(
    eReply(
      "Notice",
      "This dashboard form is no longer available. Please use the latest Control Center message.",
    ),
  );
}
