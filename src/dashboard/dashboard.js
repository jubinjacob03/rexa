import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, UserSelectMenuBuilder } from "discord.js";
import { SectionBuilder, ThumbnailBuilder } from "discord.js";
import config from "../../config.js";
import { updateConfig, loadConfig } from "../utils/automodManager.js";
import { checkModerationPermission, timeout, removeTimeout, voiceMute, voiceUnmute, voiceDeafen, voiceUndeafen, kick, ban } from "../utils/moderation.js";
import privateVC from "../commands/private-vc.js";
import privateVCAdd from "../commands/private-vc-add.js";
import privateVCRemove from "../commands/private-vc-remove.js";
import status from "../commands/status.js";
import purge from "../commands/purge.js";
import refresh from "../commands/refresh.js";
import { eReply, addFooter } from "../utils/embed.js";
import { getVCByMember, removeMember, getVCData } from "../utils/privateVCManager.js";
import { icon } from "../utils/icons.js";

/**
 * Retrieves the bot command channel from the client cache.
 * @param {import("discord.js").Client} client - The Discord client instance.
 * @returns {import("discord.js").Channel|undefined} The bot command channel, or undefined if not found.
 */
export function getBotCmdChannel(client) {
  const channelId = config.botCmdChannelId;
  return client.channels.cache.get(channelId);
}

const tempSelections = new Map();

// Cleanup abandoned selections every 15 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of tempSelections.entries()) {
    if (now - data.timestamp > 15 * 60 * 1000) {
      tempSelections.delete(key);
    }
  }
}, 15 * 60 * 1000);

function setTempSelection(key, value) {
  tempSelections.set(key, { value, timestamp: Date.now() });
}

function getTempSelection(key) {
  return tempSelections.get(key)?.value;
}

/**
 * Checks if a member has access to VC features.
 * @param {import("discord.js").Guild} guild - The guild.
 * @param {import("discord.js").GuildMember} member - The member.
 * @returns {Promise<boolean>} True if the member has access.
 */
async function hasVCAccess(guild, member) {
  if (await checkModerationPermission(guild, member.id, "mod")) return true;
  if (config.memberRoleId && member.roles.cache.has(config.memberRoleId)) return true;
  if (config.friendsRoleId && member.roles.cache.has(config.friendsRoleId)) return true;
  return false;
}

/**
 * Builds the dashboard container component for the control center.
 * @param {import("discord.js").GuildMember} member - The guild member requesting the dashboard.
 * @returns {Promise<import("discord.js").ContainerBuilder>} The constructed container builder.
 */
export async function buildDashboardContainer(member) {
  const guild = member.guild;
  const isMod = await checkModerationPermission(guild, member.user.id, "mod");
  const _isOwner = await checkModerationPermission(guild, member.user.id, "owner");

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
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerContent)
    );
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${icon("VOICE")} Voice Manager\nCreate and manage your private voice channels.`));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("shantha_vc_create").setLabel("Create").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_vc_add").setLabel("Add").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_vc_remove").setLabel("Remove").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_vc_leave").setLabel("Leave").setStyle(ButtonStyle.Secondary)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    isMod ? `### ${icon("BOT")} AutoMOD\n**Master :** ${onOff(automodOn)} • **Spam :** ${onOff(spamOn)} • **Raid :** ${onOff(raidOn)} • **Toxicity :** ${onOff(toxicityOn)}` : `### ${icon("BOT")} AutoMOD\n🔒 *Requires moderator permissions*`
  ));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("shantha_automod_master").setLabel(`Automod: ${onOff(automodOn)}`).setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_automod_limits").setLabel("Edit Limits").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_automod_spam").setLabel(`Spam: ${onOff(spamOn)}`).setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_automod_raid").setLabel(`Raid: ${onOff(raidOn)}`).setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_automod_toxicity").setLabel(`Toxicity: ${onOff(toxicityOn)}`).setStyle(ButtonStyle.Secondary).setDisabled(!isMod)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    isMod ? `### ${icon("PURGE")} Purge\nPurge messages and manage server content.` : `### ${icon("PURGE")} Purge\n🔒 *Requires moderator permissions*`
  ));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("shantha_purge_all").setLabel("Purge All").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_purge_user").setLabel("Purge User").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_purge_trail").setLabel("Purge Trail").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_purge_trail_user").setLabel("Purge Trail User").setStyle(ButtonStyle.Secondary).setDisabled(!isMod)
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    isMod ? `### ${icon("CHANNELS")} System\nStatus and moderation tools.` : `### ${icon("CHANNELS")} System\n🔒 *Requires moderator permissions*`
  ));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("shantha_status").setLabel("Status").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_mod_timeout").setLabel("Timeout").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_mod_remtimeout").setLabel("Remove Timeout").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_mod_mute").setLabel("Mute").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_mod_unmute").setLabel("Unmute").setStyle(ButtonStyle.Secondary).setDisabled(!isMod)
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("shantha_mod_deafen").setLabel("Deafen").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_mod_undeafen").setLabel("Undeafen").setStyle(ButtonStyle.Secondary).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_mod_kick").setLabel("Kick").setStyle(ButtonStyle.Danger).setDisabled(!isMod),
      new ButtonBuilder().setCustomId("shantha_mod_ban").setLabel("Ban").setStyle(ButtonStyle.Danger).setDisabled(!isMod)
    )
  );

  addFooter(container);
  return container;
}

/**
 * Parses an ID from a mention string based on a regex pattern.
 * @param {string} value - The mention string.
 * @param {RegExp} pattern - The regex pattern to match.
 * @returns {string|null} The extracted ID, or null if no match.
 */
function parseIdFromMention(value, pattern) {
  const match = value.match(pattern);
  return match ? match[1] : null;
}

/**
 * Resolves a guild member from a user input string (mention, ID, or username#discriminator).
 * @param {import("discord.js").Guild} guild - The guild to search in.
 * @param {string} value - The input string to resolve.
 * @returns {Promise<import("discord.js").GuildMember|null>} The resolved member, or null if not found.
 */
async function resolveMemberFromInput(guild, value) {
  const mentionId = parseIdFromMention(value, /^<@!?([0-9]+)>$/);
  if (mentionId) return guild.members.fetch(mentionId).catch(() => null);
  if (/^[0-9]{17,20}$/.test(value)) return guild.members.fetch(value).catch(() => null);
  const [name, discrim] = value.split("#");
  if (name && discrim) {
    return guild.members.cache.find(
      (m) => m.user.username === name && m.user.discriminator === discrim,
    );
  }
  return null;
}

/**
 * Resolves a channel from a user input string (mention or ID).
 * @param {import("discord.js").Guild} guild - The guild to search in.
 * @param {string} value - The input string to resolve.
 * @returns {import("discord.js").Channel|null} The resolved channel, or null if not found.
 */
function resolveChannelFromInput(guild, value) {
  const mentionId = parseIdFromMention(value, /^<#([0-9]+)>$/);
  if (mentionId) return guild.channels.cache.get(mentionId) || null;
  if (/^[0-9]{17,20}$/.test(value)) return guild.channels.cache.get(value) || null;
  return null;
}

/**
 * Gets the dashboard components for a member.
 * @param {import("discord.js").GuildMember} member - The guild member.
 * @returns {Promise<Array>} An array of components.
 */
export async function getDashboardComponents(_member) {
  return [];
}

/**
 * Shows a modal for purging messages.
 * @param {import("discord.js").Interaction} interaction - The interaction that triggered the modal.
 * @param {string} customId - The custom ID for the modal.
 * @param {string} title - The title of the modal.
 * @param {Array<{customId: string, label: string, required?: boolean}>} fields - The fields to add to the modal.
 * @returns {Promise<void>}
 */
export async function showPurgeModal(interaction, customId, title, fields) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  fields.forEach(f => {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(f.customId)
          .setLabel(f.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(f.required !== false)
      )
    );
  });
  return interaction.showModal(modal);
}

/**
 * Shows a select menu with a confirmation button.
 * @param {import("discord.js").Interaction} interaction - The interaction that triggered this.
 * @param {string} title - The title of the container.
 * @param {string} description - The description of the container.
 * @param {string} selectId - The custom ID for the select menu.
 * @param {string} confirmId - The custom ID for the confirm button.
 * @param {string} confirmLabel - The label for the confirm button.
 * @param {number} [maxValues=1] - The maximum number of values that can be selected.
 * @returns {Promise<void>}
 */
export async function showSelectWithConfirm(interaction, title, description, selectId, confirmId, confirmLabel, maxValues = 1) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(selectId)
    .setPlaceholder('Select users...')
    .setMinValues(1)
    .setMaxValues(maxValues);

  const row = new ActionRowBuilder().addComponents(select);
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel(confirmLabel).setStyle(ButtonStyle.Primary)
  );

  const container = new ContainerBuilder()
    .setAccentColor(0x00ced1);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${title}**\n${description}`)
  );
  container.addActionRowComponents(row);
  container.addActionRowComponents(confirmRow);
  addFooter(container);

  await interaction.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
}

/**
 * Handles select menu interactions for the dashboard.
 * @param {import("discord.js").Interaction} interaction - The interaction to handle.
 * @returns {Promise<void>}
 */
export async function handleDashboardSelect(interaction) {
  if (!interaction.isUserSelectMenu()) return;
  if ([
    "shantha_private_vc_select",
    "shantha_vc_add_select",
    "shantha_vc_remove_select",
    "shantha_purge_user_select",
    "shantha_purge_trail_user_select",
    "shantha_mod_timeout_select",
    "shantha_mod_remtimeout_select",
    "shantha_mod_mute_select",
    "shantha_mod_unmute_select",
    "shantha_mod_deafen_select",
    "shantha_mod_undeafen_select",
    "shantha_mod_kick_select",
    "shantha_mod_ban_select"
  ].includes(interaction.customId)) {
    setTempSelection(`${interaction.user.id}_${interaction.customId}`, interaction.values);
    return interaction.deferUpdate();
  }
}

/**
 * Builds the payload for the dashboard message.
 * @param {import("discord.js").GuildMember} member - The guild member.
 * @returns {Promise<import("discord.js").MessageCreateOptions>} The message payload.
 */
async function buildDashboardPayload(member) {
  const container = await buildDashboardContainer(member);
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

/**
 * Posts or updates the dashboard message in the bot command channel.
 * @param {import("discord.js").Client} client - The Discord client instance.
 * @returns {Promise<void>}
 */
export async function postDashboard(client) {
  const channel = getBotCmdChannel(client);
  if (!channel) return;
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find((m) => {
    if (m.author.id !== client.user.id) return false;
    if (m.embeds[0]?.title?.includes("Shantha Bot Command Center")) return true;
    if (m.embeds[0]?.title?.includes("Shantha Control Center")) return true;
    const flat = JSON.stringify(m.components ?? []);
    return flat.includes("Control Center");
  });
  const payload = await buildDashboardPayload(channel.guild.members.me);
  if (existing) {
    const isLegacy = !!existing.embeds[0]?.title;
    if (isLegacy) {
      await existing.delete().catch(() => {});
      await channel.send(payload).catch(err => console.error("[Dashboard] Failed to send new dashboard:", err));
    } else {
      await existing.edit(payload).catch(err => console.error("[Dashboard] Failed to edit existing dashboard:", err));
    }
  } else {
    await channel.send(payload).catch(err => console.error("[Dashboard] Failed to send dashboard:", err));
  }
}

/**
 * Handles button interactions for the dashboard.
 * @param {import("discord.js").Interaction} interaction - The interaction to handle.
 * @returns {Promise<void>}
 */
export async function handleDashboardInteraction(interaction) {
  if (!interaction.isButton()) return;
  const { member } = interaction;
  switch (interaction.customId) {
    case "shantha_vc_create": {
      if (!(await hasVCAccess(interaction.guild, member))) return interaction.reply(eReply("Access denied", "You need the Member or Friends role to use this."));
      return showSelectWithConfirm(interaction, "Create Private VC", "Select up to 5 members to invite using the dropdown below, then click Create.", "shantha_private_vc_select", "shantha_private_vc_confirm", "Create VC", 5);
    }
    case "shantha_vc_add": {
      if (!(await hasVCAccess(interaction.guild, member))) return interaction.reply(eReply("Access denied", "You need the Member or Friends role to use this."));
      return showSelectWithConfirm(interaction, "Add Member", "Select a member from the dropdown, then click Add.", "shantha_vc_add_select", "shantha_vc_add_confirm", "Add Member", 1);
    }
    case "shantha_vc_remove": {
      if (!(await hasVCAccess(interaction.guild, member))) return interaction.reply(eReply("Access denied", "You need the Member or Friends role to use this."));
      const channelId = getVCByMember(interaction.user.id);
      if (!channelId) return interaction.reply(eReply("Access denied", "You are not in a private VC."));
      const vcData = getVCData(channelId);
      if (vcData && vcData.creatorId !== interaction.user.id && !(await checkModerationPermission(interaction.guild, interaction.user.id, "mod"))) {
        return interaction.reply(eReply("Access denied", "Only the creator of the VC can remove members."));
      }
      return showSelectWithConfirm(interaction, "Remove Member", "Select a member from the dropdown, then click Remove.", "shantha_vc_remove_select", "shantha_vc_remove_confirm", "Remove Member", 1);
    }
    case "shantha_vc_leave": {
      if (!(await hasVCAccess(interaction.guild, member))) return interaction.reply(eReply("Access denied", "You need the Member or Friends role to use this."));
      const guild = interaction.guild;
      const invokerId = interaction.user.id;
      const channelId = getVCByMember(invokerId);
      if (!channelId) {
        return interaction.reply(
          eReply("Access denied", "You are not in a private VC."),
        );
      }
      const invokerMember = interaction.member;
      if (invokerMember.voice?.channelId !== channelId) {
        return interaction.reply(
          eReply("Not connected", "Join your private VC to use this."),
        );
      }
      await removeMember(channelId, invokerMember, guild);
      return interaction.reply(
        eReply("Left VC", "You have left your private VC."),
      );
    }
    case "shantha_automod_master":
    case "shantha_automod_limits":
    case "shantha_automod_spam":
    case "shantha_automod_raid":
    case "shantha_automod_toxicity": {
      if (!(await checkModerationPermission(interaction.guild, interaction.user.id, "mod"))) {
        return interaction.reply(
          eReply("Access denied", "Only moderators can modify automod."),
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
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("limit_chdel")
              .setLabel("Max channel deletes")
              .setStyle(TextInputStyle.Short)
              .setValue(current.limits.channelDelete.toString())
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("limit_nick")
              .setLabel("Max nickname changes")
              .setStyle(TextInputStyle.Short)
              .setValue(current.limits.nicknameChange.toString())
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("limit_msgdel")
              .setLabel("Max message deletes")
              .setStyle(TextInputStyle.Short)
              .setValue(current.limits.messageDelete.toString())
              .setRequired(true)
          )
        );
        return interaction.showModal(modal);
      }
      return interaction.update(await buildDashboardPayload(member));
    }
    
    case "shantha_private_vc_confirm": {
      const cacheKey = `${interaction.user.id}_shantha_private_vc_select`;
      const values = getTempSelection(cacheKey) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select at least 1 member first."));
      tempSelections.delete(cacheKey);
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const resolvedMembers = [];
      for (const id of values) {
        const member = await interaction.guild.members.fetch(id).catch(() => null);
        if (member && !member.user.bot) resolvedMembers.push(member);
      }
      if (!resolvedMembers.find(m => m.id === interaction.user.id)) {
        const invoker = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (invoker) resolvedMembers.unshift(invoker);
      }
      const mapping = {};
      for (let i = 0; i < resolvedMembers.length; i++) mapping[`member${i + 1}`] = resolvedMembers[i].user;
      interaction.options = { getUser: (key) => mapping[key] || null };
      try {
        const m = await import("../commands/private-vc.js");
        await m.default.execute(interaction);
      } catch (err) {
        console.error(err);
        await interaction.editReply(eReply("Error", "Failed to create VC."));
      }
      return;
    }
    case "shantha_vc_add_confirm": {
      const cacheKey = `${interaction.user.id}_shantha_vc_add_select`;
      const values = getTempSelection(cacheKey) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select 1 member first."));
      tempSelections.delete(cacheKey);
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const member = await interaction.guild.members.fetch(values[0]).catch(() => null);
      if (!member) return interaction.editReply(eReply("Notice", "Member not found."));
      interaction.options = { getUser: (key) => key === "member" ? member.user : null };
      try {
        const m = await import("../commands/private-vc-add.js");
        await m.default.execute(interaction);
      } catch (err) {
        console.error(err);
        await interaction.editReply(eReply("Error", "Failed to add member."));
      }
      return;
    }
    case "shantha_vc_remove_confirm": {
      const cacheKey = `${interaction.user.id}_shantha_vc_remove_select`;
      const values = getTempSelection(cacheKey) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select 1 member first."));
      tempSelections.delete(cacheKey);
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const member = await interaction.guild.members.fetch(values[0]).catch(() => null);
      if (!member) return interaction.editReply(eReply("Notice", "Member not found."));
      interaction.options = { getUser: (key) => key === "member" ? member.user : null };
      try {
        const m = await import("../commands/private-vc-remove.js");
        await m.default.execute(interaction);
      } catch (err) {
        console.error(err);
        await interaction.editReply(eReply("Error", "Failed to remove member."));
      }
      return;
    }
    case "shantha_purge_user_confirm":
    case "shantha_purge_trail_user_confirm": {
      const isTrail = interaction.customId === "shantha_purge_trail_user_confirm";
      const selectId = isTrail ? "shantha_purge_trail_user_select" : "shantha_purge_user_select";
      const cacheKey = `${interaction.user.id}_${selectId}`;
      const values = getTempSelection(cacheKey) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select 1 member first."));
      tempSelections.delete(cacheKey);
      
      const member = await interaction.guild.members.fetch(values[0]).catch(() => null);
      if (!member) return interaction.reply(eReply("Notice", "Member not found."));
      
      const targetCacheKey = `${interaction.user.id}_${isTrail ? 'purge_trail_target' : 'purge_user_target'}`;
      setTempSelection(targetCacheKey, { purgeUserId: member.id });
      
      const modalId = isTrail ? "shantha_purge_trail_user_modal" : "shantha_purge_user_modal";
      const fields = [];
      if (isTrail) {
        fields.push({ customId: "purge_message", label: "Start message ID", required: true });
        fields.push({ customId: "purge_channel", label: "Channel (Optional if msg ID given)", required: false });
      } else {
        fields.push({ customId: "purge_channel", label: "Channel (#channel or ID)", required: true });
      }
      
      const modal = new ModalBuilder().setCustomId(modalId).setTitle("Purge Confirmation");
      for (const field of fields) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(field.customId)
              .setLabel(field.label)
              .setStyle(TextInputStyle.Short)
              .setRequired(field.required)
          )
        );
      }
      return interaction.showModal(modal);
    }

    case "shantha_status":
      return await status.execute(interaction);
    
    case "shantha_mod_timeout":
    case "shantha_mod_remtimeout":
    case "shantha_mod_mute":
    case "shantha_mod_unmute":
    case "shantha_mod_deafen":
    case "shantha_mod_undeafen":
    case "shantha_mod_kick":
    case "shantha_mod_ban": {
      const isOwnerReq = interaction.customId === "shantha_mod_kick" || interaction.customId === "shantha_mod_ban";
      const isModReq = !isOwnerReq;
      const isOwner = await checkModerationPermission(interaction.guild, member.id, "owner");
      const isMod = isOwner || await checkModerationPermission(interaction.guild, member.id, "mod");
      if (isOwnerReq && !isOwner) return interaction.reply(eReply("Notice", "🔒 Owners only."));
      if (isModReq && !isMod) return interaction.reply(eReply("Notice", "🔒 Moderators only."));
      
      const titleMap = {
        shantha_mod_timeout: "Timeout User",
        shantha_mod_remtimeout: "Remove Timeout",
        shantha_mod_mute: "Voice Mute",
        shantha_mod_unmute: "Voice Unmute",
        shantha_mod_deafen: "Voice Deafen",
        shantha_mod_undeafen: "Voice Undeafen",
        shantha_mod_kick: "Kick User",
        shantha_mod_ban: "Ban User"
      };
      const descMap = {
        shantha_mod_timeout: "Select user to timeout.",
        shantha_mod_remtimeout: "Select user to remove timeout from.",
        shantha_mod_mute: "Select user to server mute.",
        shantha_mod_unmute: "Select user to server unmute.",
        shantha_mod_deafen: "Select user to server deafen.",
        shantha_mod_undeafen: "Select user to server undeafen.",
        shantha_mod_kick: "Select user to kick.",
        shantha_mod_ban: "Select user to ban."
      };
      
      return showSelectWithConfirm(interaction, titleMap[interaction.customId], descMap[interaction.customId], `${interaction.customId}_select`, `${interaction.customId}_confirm`, "Confirm Target", 1);
    }

    case "shantha_mod_timeout_confirm":
    case "shantha_mod_remtimeout_confirm":
    case "shantha_mod_mute_confirm":
    case "shantha_mod_unmute_confirm":
    case "shantha_mod_deafen_confirm":
    case "shantha_mod_undeafen_confirm":
    case "shantha_mod_kick_confirm":
    case "shantha_mod_ban_confirm": {
      const action = interaction.customId.replace("_confirm", "");
      const selectId = `${action}_select`;
      const cacheKey = `${interaction.user.id}_${selectId}`;
      const values = getTempSelection(cacheKey) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select 1 member first."));
      tempSelections.delete(cacheKey);
      
      const member = await interaction.guild.members.fetch(values[0]).catch(() => null);
      if (!member) return interaction.reply(eReply("Notice", "Member not found."));
      
      setTempSelection(`${interaction.user.id}_mod_target`, member.id);
      
      if (action === "shantha_mod_remtimeout") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await removeTimeout(member, `[Dashboard] Removed by ${interaction.user.tag}`);
          return interaction.editReply(eReply("Success", `Removed timeout from ${member.user.tag}.`));
        } catch (err) {
          console.error(err);
          return interaction.editReply(eReply("Error", "Failed to remove timeout."));
        }
      }
      
      if (action === "shantha_mod_unmute") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await voiceUnmute(member, `[Dashboard] Unmuted by ${interaction.user.tag}`);
          return interaction.editReply(eReply("Success", `Unmuted ${member.user.tag}.`));
        } catch (err) {
          console.error(err);
          return interaction.editReply(eReply("Error", "Failed to unmute."));
        }
      }
      
      if (action === "shantha_mod_undeafen") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await voiceUndeafen(member, `[Dashboard] Undeafened by ${interaction.user.tag}`);
          return interaction.editReply(eReply("Success", `Undeafened ${member.user.tag}.`));
        } catch (err) {
          console.error(err);
          return interaction.editReply(eReply("Error", "Failed to undeafen."));
        }
      }
      
      const modal = new ModalBuilder().setCustomId(`${action}_modal`).setTitle("Moderation Action");
      
      if (action === "shantha_mod_timeout") {
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("mod_duration").setLabel("Duration (minutes)").setStyle(TextInputStyle.Short).setRequired(true)));
      }
      if (action === "shantha_mod_ban") {
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("mod_deletedays").setLabel("Days to delete messages (0-7)").setStyle(TextInputStyle.Short).setValue("0").setRequired(true)));
      }
      
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("mod_reason").setLabel("Reason").setStyle(TextInputStyle.Paragraph).setRequired(false)));
      return interaction.showModal(modal);
    }

    case "shantha_purge_all":
      if (!(await checkModerationPermission(interaction.guild, member.id, "owner")))
        return interaction.reply(eReply("Notice", "Owners only."));
      return showPurgeModal(interaction, "shantha_purge_all_modal", "Purge All Messages", [
        { customId: "purge_channel", label: "Channel (#channel or ID)", required: true },
      ]);
    case "shantha_purge_user":
      if (!(await checkModerationPermission(interaction.guild, member.id, "owner"))) return interaction.reply(eReply("Notice", "Owners only."));
      return showSelectWithConfirm(interaction, "Purge User", "Select the user whose messages you want to purge, then click Confirm.", "shantha_purge_user_select", "shantha_purge_user_confirm", "Confirm Target", 1);
    case "shantha_purge_trail":
      if (!(await checkModerationPermission(interaction.guild, member.id, "owner")))
        return interaction.reply(eReply("Notice", "Owners only."));
      return showPurgeModal(interaction, "shantha_purge_trail_modal", "Purge Trail", [
        { customId: "purge_message", label: "Start message ID", required: true },
        { customId: "purge_channel", label: "Channel (Optional if msg ID given)", required: false },
      ]);
    case "shantha_purge_trail_user":
      if (!(await checkModerationPermission(interaction.guild, member.id, "owner"))) return interaction.reply(eReply("Notice", "Owners only."));
      return showSelectWithConfirm(interaction, "Purge From Message", "Select the user to purge messages from a starting message, then click Confirm.", "shantha_purge_trail_user_select", "shantha_purge_trail_user_confirm", "Confirm Target", 1);
    case "shantha_refresh":
      if (!(await checkModerationPermission(interaction.guild, member.id, "mod")))
        return interaction.reply(eReply("Notice", "Moderators only."));
      return await refresh.execute(interaction);
  }
}

/**
 * Handles modal submit interactions for the dashboard.
 * @param {import("discord.js").Interaction} interaction - The interaction to handle.
 * @returns {Promise<void>}
 */
export async function handleDashboardModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId === "shantha_automod_limits_modal") {
    const rawMsg = parseInt(interaction.fields.getTextInputValue("limit_msg"));
    const msg = isNaN(rawMsg) ? 5 : rawMsg;
    const rawChDel = parseInt(interaction.fields.getTextInputValue("limit_chdel"));
    const chDel = isNaN(rawChDel) ? 2 : rawChDel;
    const rawNick = parseInt(interaction.fields.getTextInputValue("limit_nick"));
    const nick = isNaN(rawNick) ? 3 : rawNick;
    const rawMsgDel = parseInt(interaction.fields.getTextInputValue("limit_msgdel"));
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
  if (interaction.customId === "shantha_private_vc_modal") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const members = [];
    for (let i = 1; i <= 5; i++) {
      const val = interaction.fields.getTextInputValue(`member${i}`)?.trim();
      if (val) members.push(val);
    }
    const resolvedMembers = [];
    for (const val of members) {
      const user = await resolveMemberFromInput(interaction.guild, val);
      if (user && !user.user.bot) resolvedMembers.push(user);
    }
    if (!resolvedMembers.find(m => m.id === interaction.user.id)) {
      const invoker = await interaction.guild.members.fetch(interaction.user.id);
      resolvedMembers.unshift(invoker);
    }

    interaction.options = {
      getUser: (key) => resolvedMembers[key.replace("member", "") - 1]?.user || null
    };
    await privateVC.execute(interaction);
    return;
  }
  if (interaction.customId === "shantha_vc_add_modal") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const raw = interaction.fields.getTextInputValue("member")?.trim();
    const member = raw ? await resolveMemberFromInput(interaction.guild, raw) : null;
    if (!member) {
      return interaction.editReply(eReply("Notice", "Member not found."));
    }
    interaction.options = { getUser: () => member.user };
    await privateVCAdd.execute(interaction);
    return;
  }
  if (interaction.customId === "shantha_vc_remove_modal") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const raw = interaction.fields.getTextInputValue("member")?.trim();
    const member = raw ? await resolveMemberFromInput(interaction.guild, raw) : null;
    if (!member) {
      return interaction.editReply(eReply("Notice", "Member not found."));
    }
    interaction.options = { getUser: () => member.user };
    await privateVCRemove.execute(interaction);
    return;
  }
  if (interaction.customId.endsWith("_modal") && interaction.customId.startsWith("shantha_mod_")) {
    const action = interaction.customId.replace("_modal", "");
    const cacheKey = `${interaction.user.id}_mod_target`;
    const targetId = getTempSelection(cacheKey);
    if (!targetId) return interaction.reply(eReply("Error", "Target lost from cache."));
    tempSelections.delete(cacheKey);
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) return interaction.editReply(eReply("Error", "Target member no longer found."));
    
    let reason = "No reason provided.";
    try { 
      const inputReason = interaction.fields.getTextInputValue("mod_reason");
      if (inputReason) reason = inputReason;
    } catch {}
    
    let resultStr = "";
    try {
      switch (action) {
        case "shantha_mod_timeout": {
          const duration = parseInt(interaction.fields.getTextInputValue("mod_duration")) || 5;
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
          const days = parseInt(interaction.fields.getTextInputValue("mod_deletedays")) || 0;
          resultStr = await ban(targetMember, days, reason);
          break;
        }
      }
      return interaction.editReply(eReply("Moderation Action", resultStr));
    } catch (err) {
      return interaction.editReply(eReply("Error", err.message || "Action failed."));
    }
  }
  
  if (interaction.customId.startsWith("shantha_purge_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const getVal = (id) => {
      try { return interaction.fields.getTextInputValue(id)?.trim(); }
      catch { return null; }
    };
    const channelRaw = getVal("purge_channel");
    let channel = channelRaw ? resolveChannelFromInput(interaction.guild, channelRaw) : null;
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
          } catch (e) {}
        }
      }
    }

    if (!channel) {
      return interaction.editReply(eReply("Notice", "Channel not found. Please provide a valid channel or ensure the message ID exists."));
    }
    const userRaw = getVal("purge_user");
    let user = userRaw ? await resolveMemberFromInput(interaction.guild, userRaw) : null;
    
    const isTrail = interaction.customId === "shantha_purge_trail_user_modal";
    const targetCacheKey = `${interaction.user.id}_${isTrail ? 'purge_trail_target' : 'purge_user_target'}`;
    
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
    const messageId = getVal("purge_message");
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
    await purge.execute(interaction);
    return;
  }
}
