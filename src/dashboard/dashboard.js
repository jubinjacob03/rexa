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
import { getVCByMember, removeMember } from "../utils/privateVCManager.js";
import { icon } from "../utils/icons.js";

export function getBotCmdChannel(client) {
  const channelId = config.botCmdChannelId;
  return client.channels.cache.get(channelId);
}

const tempSelections = new Map();

export async function buildDashboardContainer(member) {
  const guild = member.guild;
  const isMod = await checkModerationPermission(guild, member.user.id, "mod");
  const isOwner = await checkModerationPermission(guild, member.user.id, "owner");

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

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${icon("BOT")} AutoMOD\n**Master :** ${onOff(automodOn)} • **Spam :** ${onOff(spamOn)} • **Raid :** ${onOff(raidOn)} • **Toxicity :** ${onOff(toxicityOn)}`));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("shantha_automod_master").setLabel(`Automod: ${onOff(automodOn)}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_automod_limits").setLabel("Edit Limits").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_automod_spam").setLabel(`Spam: ${onOff(spamOn)}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_automod_raid").setLabel(`Raid: ${onOff(raidOn)}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_automod_toxicity").setLabel(`Toxicity: ${onOff(toxicityOn)}`).setStyle(ButtonStyle.Secondary)
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
      new ButtonBuilder().setCustomId("shantha_status").setLabel("Status").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_mod_timeout").setLabel("Timeout").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_mod_remtimeout").setLabel("Remove Timeout").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_mod_mute").setLabel("Mute").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_mod_unmute").setLabel("Unmute").setStyle(ButtonStyle.Secondary)
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("shantha_mod_deafen").setLabel("Deafen").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_mod_undeafen").setLabel("Undeafen").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("shantha_mod_kick").setLabel("Kick").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("shantha_mod_ban").setLabel("Ban").setStyle(ButtonStyle.Danger)
    )
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
  if (/^[0-9]{17,20}$/.test(value)) return guild.members.fetch(value).catch(() => null);
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
  if (/^[0-9]{17,20}$/.test(value)) return guild.channels.cache.get(value) || null;
  return null;
}

export async function getDashboardComponents(member) {
  return [];
}

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

export async function handleDashboardSelect(interaction) {
  if (!interaction.isUserSelectMenu()) return;
  if ([
    "shantha_private_vc_select",
    "shantha_vc_add_select",
    "shantha_vc_remove_select",
    "shantha_purge_user_select",
    "shantha_purge_trail_user_select"
  ].includes(interaction.customId)) {
    tempSelections.set(`${interaction.user.id}_${interaction.customId}`, interaction.values);
    return interaction.deferUpdate();
  }
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
    return flat.includes("Control Center");
  });
  const payload = await buildDashboardPayload(channel.guild.members.me);
  if (existing) {
    const isLegacy = !!existing.embeds[0]?.title;
    if (isLegacy) {
      await existing.delete().catch(() => {});
      await channel.send(payload);
    } else {
      await existing.edit(payload);
    }
  } else {
    await channel.send(payload);
  }
}

export async function handleDashboardInteraction(interaction) {
  if (!interaction.isButton()) return;
  const { member } = interaction;
  switch (interaction.customId) {
    case "shantha_vc_create": return showSelectWithConfirm(interaction, "Create Private VC", "Select up to 5 members to invite using the dropdown below, then click Create.", "shantha_private_vc_select", "shantha_private_vc_confirm", "Create VC", 5);
    case "shantha_vc_add": return showSelectWithConfirm(interaction, "Add Member", "Select a member from the dropdown, then click Add.", "shantha_vc_add_select", "shantha_vc_add_confirm", "Add Member", 1);
    case "shantha_vc_remove": return showSelectWithConfirm(interaction, "Remove Member", "Select a member from the dropdown, then click Remove.", "shantha_vc_remove_select", "shantha_vc_remove_confirm", "Remove Member", 1);
    case "shantha_vc_leave": {
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
      if (interaction.guild && interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply(
          eReply("Access denied", "Only the server owner can modify automod."),
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
      const values = tempSelections.get(`${interaction.user.id}_shantha_private_vc_select`) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select at least 1 member first."));
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
      await import("../commands/private-vc.js").then(m => m.default.execute(interaction));
      return;
    }
    case "shantha_vc_add_confirm": {
      const values = tempSelections.get(`${interaction.user.id}_shantha_vc_add_select`) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select 1 member first."));
      const member = await interaction.guild.members.fetch(values[0]).catch(() => null);
      if (!member) return interaction.reply(eReply("Notice", "Member not found."));
      interaction.options = { getUser: (key) => key === "member" ? member.user : null };
      await import("../commands/private-vc-add.js").then(m => m.default.execute(interaction));
      return;
    }
    case "shantha_vc_remove_confirm": {
      const values = tempSelections.get(`${interaction.user.id}_shantha_vc_remove_select`) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select 1 member first."));
      const member = await interaction.guild.members.fetch(values[0]).catch(() => null);
      if (!member) return interaction.reply(eReply("Notice", "Member not found."));
      interaction.options = { getUser: (key) => key === "member" ? member.user : null };
      await import("../commands/private-vc-remove.js").then(m => m.default.execute(interaction));
      return;
    }
    case "shantha_purge_user_confirm":
    case "shantha_purge_trail_user_confirm": {
      const isTrail = interaction.customId === "shantha_purge_trail_user_confirm";
      const selectId = isTrail ? "shantha_purge_trail_user_select" : "shantha_purge_user_select";
      const values = tempSelections.get(`${interaction.user.id}_${selectId}`) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select 1 member first."));
      const member = await interaction.guild.members.fetch(values[0]).catch(() => null);
      if (!member) return interaction.reply(eReply("Notice", "Member not found."));
      
      tempSelections.set(interaction.user.id, { purgeUserId: member.id });
      
      const modalId = isTrail ? "shantha_purge_trail_user_modal" : "shantha_purge_user_modal";
      const fields = [ { customId: "purge_channel", label: "Channel (#channel or ID)", required: true } ];
      if (isTrail) fields.push({ customId: "purge_message", label: "Start message ID", required: true });
      
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
      const values = tempSelections.get(`${interaction.user.id}_${selectId}`) || [];
      if (!values.length) return interaction.reply(eReply("Notice", "Please select 1 member first."));
      const member = await interaction.guild.members.fetch(values[0]).catch(() => null);
      if (!member) return interaction.reply(eReply("Notice", "Member not found."));
      
      tempSelections.set(`${interaction.user.id}_mod_target`, member.id);
      
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
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply(eReply("Notice", "Admins only."));
      return showPurgeModal(interaction, "shantha_purge_all_modal", "Purge All Messages", [
        { customId: "purge_channel", label: "Channel (#channel or ID)", required: true },
      ]);
    case "shantha_purge_user":
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply(eReply("Notice", "Admins only."));
      return showSelectWithConfirm(interaction, "Purge User", "Select the user whose messages you want to purge, then click Confirm.", "shantha_purge_user_select", "shantha_purge_user_confirm", "Confirm Target", 1);
    case "shantha_purge_trail":
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply(eReply("Notice", "Admins only."));
      return showPurgeModal(interaction, "shantha_purge_trail_modal", "Purge Trail", [
        { customId: "purge_channel", label: "Channel (#channel or ID)", required: true },
        { customId: "purge_message", label: "Start message ID", required: true },
      ]);
    case "shantha_purge_trail_user":
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply(eReply("Notice", "Admins only."));
      return showSelectWithConfirm(interaction, "Purge From Message", "Select the user to purge messages from a starting message, then click Confirm.", "shantha_purge_trail_user_select", "shantha_purge_trail_user_confirm", "Confirm Target", 1);
    case "shantha_refresh":
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply(eReply("Notice", "Admins only."));
      return await refresh.execute(interaction);
  }
}

export async function handleDashboardModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId === "shantha_automod_limits_modal") {
    const msg = parseInt(interaction.fields.getTextInputValue("limit_msg")) || 5;
    const chDel = parseInt(interaction.fields.getTextInputValue("limit_chdel")) || 2;
    const nick = parseInt(interaction.fields.getTextInputValue("limit_nick")) || 3;
    const msgDel = parseInt(interaction.fields.getTextInputValue("limit_msgdel")) || 3;
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
      getUser: (key) => resolvedMembers[key.replace("member", "") - 1] || null
    };
    await privateVC.execute(interaction);
    return;
  }
  if (interaction.customId === "shantha_vc_add_modal") {
    const raw = interaction.fields.getTextInputValue("member")?.trim();
    const member = raw ? await resolveMemberFromInput(interaction.guild, raw) : null;
    if (!member) {
      return interaction.reply(eReply("Notice", "Member not found."));
    }
    interaction.options = { getUser: () => member.user };
    await privateVCAdd.execute(interaction);
    return;
  }
  if (interaction.customId === "shantha_vc_remove_modal") {
    const raw = interaction.fields.getTextInputValue("member")?.trim();
    const member = raw ? await resolveMemberFromInput(interaction.guild, raw) : null;
    if (!member) {
      return interaction.reply(eReply("Notice", "Member not found."));
    }
    interaction.options = { getUser: () => member.user };
    await privateVCRemove.execute(interaction);
    return;
  }
  if (interaction.customId.endsWith("_modal") && interaction.customId.startsWith("shantha_mod_")) {
    const action = interaction.customId.replace("_modal", "");
    const targetId = tempSelections.get(`${interaction.user.id}_mod_target`);
    if (!targetId) return interaction.reply(eReply("Error", "Target lost from cache."));
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) return interaction.reply(eReply("Error", "Target member no longer found."));
    
    let reason = "No reason provided.";
    try { reason = interaction.fields.getTextInputValue("mod_reason") || reason; } catch {}
    
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
      return interaction.reply(eReply("Moderation Action", resultStr));
    } catch (err) {
      return interaction.reply(eReply("Error", err.message || "Action failed."));
    }
  }
  
  if (interaction.customId.startsWith("shantha_purge_")) {
    const getVal = (id) => {
      try { return interaction.fields.getTextInputValue(id)?.trim(); }
      catch { return null; }
    };
    const channelRaw = getVal("purge_channel");
    const channel = channelRaw ? resolveChannelFromInput(interaction.guild, channelRaw) : null;
    if (!channel) {
      return interaction.reply(eReply("Notice", "Channel not found."));
    }
    const userRaw = getVal("purge_user");
    let user = userRaw ? await resolveMemberFromInput(interaction.guild, userRaw) : null;
    if (!user && tempSelections.has(interaction.user.id)) {
      const sel = tempSelections.get(interaction.user.id);
      try {
        user = await interaction.guild.members.fetch(sel.purgeUserId);
      } catch {
        user = null;
      }
      tempSelections.delete(interaction.user.id);
    }
    if (userRaw && !user) {
      return interaction.reply(eReply("Notice", "User not found."));
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
