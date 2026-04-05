import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import supabase from "../utils/supabaseClient.js";
import { EMBED_COLOR } from "../utils/embed.js";
import { icon } from "../utils/icons.js";

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

    let ticketMods = [];
    if (supabase) {
      const { data } = await supabase
        .from("ticket_actions")
        .select("content")
        .eq("action_id", "ticket_mods_config")
        .single();
      if (data?.content) {
        try {
          ticketMods = JSON.parse(data.content);
        } catch {}
      }
    }

    // Initialize default ticket configuration for this admin session
    setupSessions.set(interaction.user.id, {
      title: "🎟️ sᴜᴘᴘᴏʀᴛ ᴛɪᴄᴋᴇᴛs",
      description:
        "ᴄʟɪᴄᴋ ᴛʜᴇ ʙᴜᴛᴛᴏɴ ʙᴇʟᴏᴡ ᴛᴏ ᴏᴘᴇɴ ᴀ ᴘʀɪᴠᴀᴛᴇ ᴛɪᴄᴋᴇᴛ.\nᴏᴜʀ ᴀɪ ᴀssɪsᴛᴀɴᴛ ᴀɴᴅ sᴛᴀғғ ᴡɪʟʟ ʙᴇ ᴡɪᴛʜ ʏᴏᴜ sʜᴏʀᴛʟʏ.",
      color: EMBED_COLOR,
      targetChannelId: targetChannel.id,
      targetChannelName: targetChannel.name,
      buttons: [],
      ticketMods,
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
      : `${icon("ERROR")} ɴᴏ ʙᴜᴛᴛᴏɴs ᴀᴅᴅᴇᴅ ʏᴇᴛ.`;

  const modsPreview =
    config.ticketMods && config.ticketMods.length > 0
      ? config.ticketMods.map((id) => `<@${id}>`).join(" ")
      : `${icon("ERROR")} ɴᴏɴᴇ sᴇᴛ — ᴜsɪɴɢ ᴅᴇғᴀᴜʟᴛ ᴍᴏᴅ ʀᴏʟᴇ.`;

  const dashboardEmbed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("🎟️ sᴜᴘᴘᴏʀᴛ ᴛɪᴄᴋᴇᴛs")
    .setDescription(
      `\u200b\nᴄᴜsᴛᴏᴍɪᴢᴇ ʜᴏᴡ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ ᴍᴇɴᴜ ʟᴏᴏᴋs ᴀɴᴅ ʙᴇʜᴀᴠᴇs ʙᴇғᴏʀᴇ ᴘᴜʙʟɪsʜɪɴɢ ɪᴛ ᴛᴏ <#${config.targetChannelId}>.\n\u200b`,
    )
    .addFields(
      { name: "ᴘʀᴇᴠɪᴇᴡ ᴛɪᴛʟᴇ", value: config.title, inline: false },
      { name: "ᴘʀᴇᴠɪᴇᴡ ᴅᴇsᴄʀɪᴘᴛɪᴏɴ", value: config.description, inline: false },
      { name: "ᴀᴛᴛᴀᴄʜᴇᴅ ʙᴜᴛᴛᴏɴs", value: buttonPreview, inline: false },
      { name: "ᴛɪᴄᴋᴇᴛ ᴍᴏᴅᴇʀᴀᴛᴏʀs", value: modsPreview, inline: false },
    )
    .setFooter({
      text: "ᴜsᴇ ᴛʜᴇ ʙᴜᴛᴛᴏɴs ʙᴇʟᴏᴡ ᴛᴏ ᴄᴏɴғɪɢᴜʀᴇ ᴀɴᴅ ᴘᴜʙʟɪsʜ. (ᴍᴀx 3 ʙᴜᴛᴛᴏɴs)",
    });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tsetup_edit_embed")
      .setLabel("ᴇᴅɪᴛ ᴇᴍʙᴇᴅ ᴛᴇxᴛ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tsetup_add_text_tkt")
      .setLabel("ᴛᴇxᴛ ᴛɪᴄᴋᴇᴛ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(config.buttons.length >= 3),
    new ButtonBuilder()
      .setCustomId("tsetup_add_vc_tkt")
      .setLabel("ᴠᴄ ᴛɪᴄᴋᴇᴛ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(config.buttons.length >= 3),
    new ButtonBuilder()
      .setCustomId("tsetup_add_text")
      .setLabel("ᴛᴇxᴛ ʀᴇᴘʟʏ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(config.buttons.length >= 3),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tsetup_add_image")
      .setLabel("ɪᴍᴀɢᴇ ʀᴇᴘʟʏ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(config.buttons.length >= 3),
    new ButtonBuilder()
      .setCustomId("tsetup_clear_buttons")
      .setEmoji(icon("WARNING"))
      .setLabel("ᴄʟᴇᴀʀ ᴀʟʟ ʙᴜᴛᴛᴏɴꜱ")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(config.buttons.length === 0),
    new ButtonBuilder()
      .setCustomId("tsetup_publish")
      .setEmoji(icon("DONE"))
      .setLabel(`ᴘᴜʙʟɪꜱʜ ᴘᴀɴᴇʟ ᴛᴏ #${config.targetChannelName}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(config.buttons.length === 0),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tsetup_set_mods")
      .setEmoji(icon("TYPE"))
      .setLabel("ᴛɪᴄᴋᴇᴛ ᴍᴏᴅꜱ")
      .setStyle(ButtonStyle.Primary),
  );

  const payload = {
    embeds: [dashboardEmbed],
    components: [row1, row2, row3],
    flags: MessageFlags.Ephemeral,
  };

  if (isUpdate) {
    try {
      await interaction.editReply(payload);
    } catch {
      await interaction.update(payload);
    }
  } else {
    await interaction.reply(payload);
  }
}
