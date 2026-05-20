import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import config from "../../config.js";
import { updateConfig, loadConfig } from "../utils/automodManager.js";
import privateVC from "../commands/private-vc.js";
import privateVCAdd from "../commands/private-vc-add.js";
import privateVCRemove from "../commands/private-vc-remove.js";
import status from "../commands/status.js";
import purge from "../commands/purge.js";
import refresh from "../commands/refresh.js";
import { eReply } from "../utils/embed.js";
import { getVCByMember, removeMember } from "../utils/privateVCManager.js";

export function getBotCmdChannel(client) {
  const channelId = config.botCmdChannelId;
  return client.channels.cache.get(channelId);
}

export async function buildDashboardContainer(member) {
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const automodConfig = await loadConfig();
  const automodOn = automodConfig.enabled;
  const spamOn = automodConfig.spam;
  const raidOn = automodConfig.raid;
  const toxicityOn = automodConfig.toxicity;
  const onOff = (v) => (v ? "ON" : "OFF");

  const container = new ContainerBuilder().setAccentColor(0x00ced1);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "## 🛠️ Shantha Control Center\nControl private VC, automod, and admin actions below."
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      "### 🎙️ Voice Manager\nCreate and manage your private voice channels."
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_vc_create")
        .setLabel("Create")
        .setEmoji("🔊")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_vc_add")
        .setLabel("Add")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_vc_remove")
        .setLabel("Remove")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_vc_leave")
        .setLabel("Leave")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `### 🤖 Automod\n**Master:** ${onOff(automodOn)} • **Spam:** ${onOff(spamOn)} • **Raid:** ${onOff(raidOn)} • **Toxicity:** ${onOff(toxicityOn)}`
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_automod_master")
        .setLabel(`Automod: ${onOff(automodOn)}`)
        .setEmoji("🤖")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_limits")
        .setLabel("Edit Limits")
        .setEmoji("🖊️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_spam")
        .setLabel(`Spam: ${onOff(spamOn)}`)
        .setEmoji("🧹")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_raid")
        .setLabel(`Raid: ${onOff(raidOn)}`)
        .setEmoji("🛡️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_toxicity")
        .setLabel(`Toxicity: ${onOff(toxicityOn)}`)
        .setEmoji("☣️")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      isAdmin
        ? "### 🛡️ Admin Tools\nPurge messages and manage server content."
        : "### 🛡️ Admin Tools\n🔒 *Requires administrator permissions*"
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_purge_all")
        .setLabel("Purge All")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isAdmin),
      new ButtonBuilder()
        .setCustomId("shantha_purge_user")
        .setLabel("Purge User")
        .setEmoji("👥")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isAdmin),
      new ButtonBuilder()
        .setCustomId("shantha_purge_trail")
        .setLabel("Purge Trail")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isAdmin),
      new ButtonBuilder()
        .setCustomId("shantha_purge_trail_user")
        .setLabel("Purge Trail User")
        .setEmoji("🧾")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isAdmin)
    )
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("### ⚙️ System")
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_status")
        .setLabel("Status")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_refresh")
        .setLabel("Refresh Info")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isAdmin)
    )
  );

  return container;
}

export function getDashboardEmbed() {
  return new EmbedBuilder()
    .setTitle("🛠️ Shantha Control Center")
    .setDescription("Control private VC, automod, and admin actions below.")
    .setColor("#00CED1");
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

export function showPrivateVCModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("shantha_private_vc_modal")
    .setTitle("Create Private VC");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("member1")
        .setLabel("Member 1 (required, @mention or ID)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("member2")
        .setLabel("Member 2 (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("member3")
        .setLabel("Member 3 (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("member4")
        .setLabel("Member 4 (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("member5")
        .setLabel("Member 5 (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    )
  );
  return interaction.showModal(modal);
}

function showPrivateVCMemberModal(interaction, customId, title, label) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("member")
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    )
  );
  return interaction.showModal(modal);
}

function showPurgeModal(interaction, customId, title, fields) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
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
    return flat.includes("Shantha Control Center");
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
    case "shantha_vc_create":
      return showPrivateVCModal(interaction);
    case "shantha_vc_add":
      return showPrivateVCMemberModal(
        interaction,
        "shantha_vc_add_modal",
        "Add Member",
        "Member (@mention or ID)",
      );
    case "shantha_vc_remove":
      return showPrivateVCMemberModal(
        interaction,
        "shantha_vc_remove_modal",
        "Remove Member",
        "Member (@mention or ID)",
      );
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
    case "shantha_status":
      return await status.execute(interaction);
    case "shantha_purge_all":
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "Admins only.", ephemeral: true });
      return showPurgeModal(interaction, "shantha_purge_all_modal", "Purge All Messages", [
        { customId: "purge_channel", label: "Channel (#channel or ID)", required: true },
      ]);
    case "shantha_purge_user":
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "Admins only.", ephemeral: true });
      return showPurgeModal(interaction, "shantha_purge_user_modal", "Purge User Messages", [
        { customId: "purge_channel", label: "Channel (#channel or ID)", required: true },
        { customId: "purge_user", label: "User (@mention or ID)", required: true },
      ]);
    case "shantha_purge_trail":
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "Admins only.", ephemeral: true });
      return showPurgeModal(interaction, "shantha_purge_trail_modal", "Purge Trail", [
        { customId: "purge_channel", label: "Channel (#channel or ID)", required: true },
        { customId: "purge_message", label: "Start message ID", required: true },
      ]);
    case "shantha_purge_trail_user":
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "Admins only.", ephemeral: true });
      return showPurgeModal(interaction, "shantha_purge_trail_user_modal", "Purge Trail (User)", [
        { customId: "purge_channel", label: "Channel (#channel or ID)", required: true },
        { customId: "purge_user", label: "User (@mention or ID)", required: true },
        { customId: "purge_message", label: "Start message ID", required: true },
      ]);
    case "shantha_refresh":
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "Admins only.", ephemeral: true });
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
    await interaction.reply({ content: "Automod limits updated.", ephemeral: true });
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
      return interaction.reply({ content: "Member not found.", ephemeral: true });
    }
    interaction.options = { getUser: () => member.user };
    await privateVCAdd.execute(interaction);
    return;
  }
  if (interaction.customId === "shantha_vc_remove_modal") {
    const raw = interaction.fields.getTextInputValue("member")?.trim();
    const member = raw ? await resolveMemberFromInput(interaction.guild, raw) : null;
    if (!member) {
      return interaction.reply({ content: "Member not found.", ephemeral: true });
    }
    interaction.options = { getUser: () => member.user };
    await privateVCRemove.execute(interaction);
    return;
  }
  if (interaction.customId.startsWith("shantha_purge_")) {
    const channelRaw = interaction.fields.getTextInputValue("purge_channel")?.trim();
    const channel = channelRaw ? resolveChannelFromInput(interaction.guild, channelRaw) : null;
    if (!channel) {
      return interaction.reply({ content: "Channel not found.", ephemeral: true });
    }
    const userRaw = interaction.fields.getTextInputValue("purge_user")?.trim();
    const user = userRaw ? await resolveMemberFromInput(interaction.guild, userRaw) : null;
    if (userRaw && !user) {
      return interaction.reply({ content: "User not found.", ephemeral: true });
    }
    const messageId = interaction.fields.getTextInputValue("purge_message")?.trim() || null;
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
