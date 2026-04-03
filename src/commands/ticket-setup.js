import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";

// Stateless in-memory store for admin setup sessions (only lasts during mapping)
export const setupSessions = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName("setup-ticket")
    .setDescription("Launch the Advanced Ticket Setup Dashboard (Rich UI)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where the ticket panel will be published")
        .setRequired(true),
    ),

  async execute(interaction) {
    const targetChannel = interaction.options.getChannel("channel");

    // Initialize default ticket configuration for this admin session
    setupSessions.set(interaction.user.id, {
      title: "🎟️ ꜱᴜᴘᴘᴏʀᴛ ᴛɪᴄᴋᴇᴛꜱ",
      description:
        "ᴄʟɪᴄᴋ ᴛʜᴇ ʙᴜᴛᴛᴏɴ ʙᴇʟᴏᴡ ᴛᴏ ᴏᴘᴇɴ ᴀ ᴘʀɪᴠᴀᴛᴇ ᴛɪᴄᴋᴇᴛ.\nᴏᴜʀ ᴀɪ ᴀꜱꜱɪꜱᴛᴀɴᴛ ᴀɴᴅ ꜱᴛᴀꜰꜰ ᴡɪʟʟ ʙᴇ ᴡɪᴛʜ ʏᴏᴜ ꜱʜᴏʀᴛʟʏ.",
      color: "#00FFFF",
      targetChannelId: targetChannel.id,
      targetChannelName: targetChannel.name,
      buttons: [], // Array of { type: 'ticket'|'text'|'image', label: string, content: string, aiAssist: boolean, ticketType: string }
    });

    await renderTicketDashboard(interaction);
  },
};

export async function renderTicketDashboard(interaction, isUpdate = false) {
  const config = setupSessions.get(interaction.user.id);
  if (!config) return;

  const buttonPreview =
    config.buttons.length > 0
      ? config.buttons
          .map((b, i) => `${i + 1}. [${b.type.toUpperCase()}] **${b.label}**`)
          .join("\n")
      : "❌ ɴᴏ ʙᴜᴛᴛᴏɴꜱ ᴀᴅᴅᴇᴅ ʏᴇᴛ.";

  const dashboardEmbed = new EmbedBuilder()
    .setColor("#00FFFF")
    .setTitle("🎟️ ꜱᴜᴘᴘᴏʀᴛ ᴛɪᴄᴋᴇᴛꜱ")
    .setDescription(
      `ᴄᴜꜱᴛᴏᴍɪᴢᴇ ʜᴏᴡ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ ᴍᴇɴᴜ ʟᴏᴏᴋꜱ ᴀɴᴅ ʙᴇʜᴀᴠᴇꜱ ʙᴇꜰᴏʀᴇ ᴘᴜʙʟɪꜱʜɪɴɢ ɪᴛ ᴛᴏ <#${config.targetChannelId}>.`,
    )
    .addFields(
      { name: "ᴘʀᴇᴠɪᴇᴡ ᴛɪᴛʟᴇ", value: config.title, inline: false },
      { name: "ᴘʀᴇᴠɪᴇᴡ ᴅᴇꜱᴄʀɪᴘᴛɪᴏɴ", value: config.description, inline: false },
      { name: "ᴀᴛᴛᴀᴄʜᴇᴅ ʙᴜᴛᴛᴏɴꜱ", value: buttonPreview, inline: false },
    )
    .setFooter({
      text: "ᴜꜱᴇ ᴛʜᴇ ʙᴜᴛᴛᴏɴꜱ ʙᴇʟᴏᴡ ᴛᴏ ᴄᴏɴꜰɪɢᴜʀᴇ ᴀɴᴅ ᴘᴜʙʟɪꜱʜ. (ᴍᴀx 3 ʙᴜᴛᴛᴏɴꜱ)",  
    });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tsetup_edit_embed")
      .setLabel("🖋️ ᴇᴅɪᴛ ᴇᴍʙᴇᴅ ᴛᴇxᴛ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tsetup_add_text_tkt")
      .setLabel("💠ᴀᴅᴅ ᴛᴇxᴛ ᴛɪᴄᴋᴇᴛ")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(config.buttons.length >= 3),
    new ButtonBuilder()
      .setCustomId("tsetup_add_vc_tkt")
      .setLabel("💠ᴀᴅᴅ ᴠᴄ ᴛɪᴄᴋᴇᴛ")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(config.buttons.length >= 3),
    new ButtonBuilder()
      .setCustomId("tsetup_add_text")
      .setLabel("💠ᴀᴅᴅ ᴛᴇxᴛ ʀᴇᴘʟʏ")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(config.buttons.length >= 3),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tsetup_add_image")
      .setLabel("💠ᴀᴅᴅ ɪᴍᴀɢᴇ ʀᴇᴘʟʏ")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(config.buttons.length >= 3),
    new ButtonBuilder()
      .setCustomId("tsetup_clear_buttons")
      .setLabel("❗ᴄʟᴇᴀʀ ᴀʟʟ ʙᴜᴛᴛᴏɴꜱ")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(config.buttons.length === 0),
    new ButtonBuilder()
      .setCustomId("tsetup_publish")
      .setLabel(`✅ ᴘᴜʙʟɪꜱʜ ᴘᴀɴᴇʟ ᴛᴏ #${config.targetChannelName}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(config.buttons.length === 0),
  );

  const payload = {
    embeds: [dashboardEmbed],
    components: [row1, row2],
    ephemeral: true,
  };

  if (isUpdate) {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.update(payload);
    }
  } else {
    await interaction.reply(payload);
  }
}
