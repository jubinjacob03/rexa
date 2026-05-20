import { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, MessageFlags } from "discord.js";
import config from "../../config.js";
import { generateAutomodDashboard, handleAutomodInteraction } from "../commands/automod.js";
import privateVC from "../commands/private-vc.js";
import status from "../commands/status.js";
import purge from "../commands/purge.js";
import refresh from "../commands/refresh.js";

export function getBotCmdChannel(client) {
  const channelId = config.botCmdChannelId;
  return client.channels.cache.get(channelId);
}

export function getDashboardEmbed() {
  return new EmbedBuilder()
    .setTitle("🛠️ Shantha Bot Command Center")
    .addFields(
      { name: "Private VC", value: "Manage your private voice channels easily.", inline: false },
      { name: "\u200B", value: "\u200B", inline: false },
      { name: "Automod", value: "Configure and control automod features.", inline: false },
      { name: "\u200B", value: "\u200B", inline: false },
      { name: "Status & Admin", value: "Server status and admin tools.", inline: false }
    )
    .setColor("#00CED1");
}

export function getDashboardComponents(member) {
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  return [
  
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_vc_create")
        .setLabel("Create VC")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("shantha_vc_add")
        .setLabel("Add Member")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("shantha_vc_remove")
        .setLabel("Remove Member")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_vc_leave")
        .setLabel("Leave VC")
        .setStyle(ButtonStyle.Danger)
    ),

    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_automod_toggle")
        .setLabel("Toggle Automod")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_limits")
        .setLabel("Edit Limits")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_spam")
        .setLabel("Spam Filter")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("shantha_automod_raid")
        .setLabel("Raid Protection")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("shantha_automod_toxicity")
        .setLabel("Toxicity Filter")
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shantha_status")
        .setLabel("Status")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("shantha_purge")
        .setLabel("Purge")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isAdmin),
      new ButtonBuilder()
        .setCustomId("shantha_refresh")
        .setLabel("Refresh Info")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!isAdmin)
    )
  ];
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

export async function postDashboard(client) {
  const channel = getBotCmdChannel(client);
  if (!channel) return;
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes("Shantha Bot Command Center"));
  if (existing) {
    await existing.edit({
      embeds: [getDashboardEmbed()],
      components: getDashboardComponents(channel.guild.members.me)
    });
  } else {
    await channel.send({
      embeds: [getDashboardEmbed()],
      components: getDashboardComponents(channel.guild.members.me)
    });
  }
}

export async function handleDashboardInteraction(interaction) {
  if (!interaction.isButton()) return;
  const { member, client } = interaction;
  switch (interaction.customId) {
    case "shantha_private_vc":
      return privateVC.execute(interaction);
    case "shantha_automod":
      return await handleAutomodInteraction(interaction);
    case "shantha_status":
      return await status.execute(interaction);
    case "shantha_purge": {
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "Admins only.", ephemeral: true });
      const modal = new ModalBuilder()
        .setCustomId("shantha_purge_modal")
        .setTitle("Bulk Delete Messages");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("purge_amount")
            .setLabel("Number of messages to delete (max 100)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
      return interaction.showModal(modal);
    }
    case "shantha_refresh":
      if (!member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ content: "Admins only.", ephemeral: true });
      return await refresh.execute(interaction);
  }
}

export async function handleDashboardModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId === "shantha_purge_modal") {
    const amount = parseInt(interaction.fields.getTextInputValue("purge_amount"));
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return interaction.reply({ content: "Invalid amount.", ephemeral: true });
    }
    interaction.options = { getInteger: () => amount };
    return await purge.execute(interaction);
  }
  if (interaction.customId === "shantha_private_vc_modal") {
    const members = [];
    for (let i = 1; i <= 5; i++) {
      const val = interaction.fields.getTextInputValue(`member${i}`)?.trim();
      if (val) members.push(val);
    }
    const resolvedMembers = [];
    for (const val of members) {
      let user = null;
      const mentionMatch = val.match(/^<@!?([0-9]+)>$/);
      if (mentionMatch) {
        user = await interaction.guild.members.fetch(mentionMatch[1]).catch(() => null);
      } else if (/^[0-9]{17,20}$/.test(val)) {
        user = await interaction.guild.members.fetch(val).catch(() => null);
      } else {
        const [name, discrim] = val.split("#");
        if (name && discrim) {
          user = interaction.guild.members.cache.find(m => m.user.username === name && m.user.discriminator === discrim);
        }
      }
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
}
