import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import supabase from "../utils/supabaseClient.js";
import { EMBED_COLOR } from "../utils/embed.js";
import { icon } from "../utils/icons.js";

export const setupSessions = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName("setup-ticket")
    .setDescription("Launch the Advanced Ticket Setup Dashboard")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where the ticket panel will be published")
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("advanced")
        .setDescription("Use the advanced ticket editor (default: off)")
        .setRequired(false),
    ),

  async execute(interaction) {
    const targetChannel = interaction.options.getChannel("channel");
    const advanced = interaction.options.getBoolean("advanced") || false;

    if (!advanced) {
      await publishSimpleTicketPanel(interaction, targetChannel);
      return;
    }

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

async function publishSimpleTicketPanel(interaction, targetChannel) {
  const botUser = interaction.client.user;
  const botAvatar = botUser.displayAvatarURL({ size: 128 });
  const year = new Date().getFullYear();
  const startYear = year - 1;
  const ts = Math.floor(Date.now() / 1000);

  const panelContainer = new ContainerBuilder()
    .setAccentColor(EMBED_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${botUser.username}**\n## ᴛɪᴄᴋᴇᴛs\nᴄʟɪᴄᴋ ᴏɴ ᴛᴏ ᴏᴘᴇɴ ᴀ ᴛɪᴄᴋᴇᴛ - ᴏᴜʀ ᴀɪ ᴀɢᴇɴᴛ ᴡɪʟʟ ᴊᴏɪɴ ʏᴏᴜ sʜᴏʀᴛʟʏ.`,
          ),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar)),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# © ${botUser.username} ${startYear} - ${year} • <t:${ts}:f>`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("tkt_open_simple")
          .setLabel("ᴄʀᴇᴀᴛᴇ ᴛɪᴄᴋᴇᴛ")
          .setStyle(ButtonStyle.Success),
      ),
    );

  await targetChannel.send({
    components: [panelContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  await interaction.reply({
    content: `✅ ᴛɪᴄᴋᴇᴛ ᴘᴀɴᴇʟ ᴄʀᴇᴀᴛᴇᴅ ɪɴ <#${targetChannel.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function renderTicketDashboard(interaction, isUpdate = false) {
  const config = setupSessions.get(interaction.user.id);
  if (!config) return;

  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
  const iconUrl = interaction.guild?.iconURL({ size: 256, dynamic: true });
  const headerContent = `## ${icon("EDITOR")} ᴛɪᴄᴋᴇᴛ ᴇᴅɪᴛᴏʀ\nᴜsᴇ ᴛʜᴇ ᴄᴏɴᴛʀᴏʟs ʙᴇʟᴏᴡ ᴛᴏ ᴄᴏɴғɪɢᴜʀᴇ ᴀɴᴅ ᴘᴜʙʟɪsʜ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ ᴘᴀɴᴇʟ.\n\n**ᴛᴀʀɢᴇᴛ:** <#${config.targetChannelId}>`;

  if (iconUrl) {
    const headerSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerContent))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl));
    container.addSectionComponents(headerSection);
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerContent),
    );
  }

  const buttonCount = config.buttons.length;
  const maxButtons = 3;
  const ticketCount = config.buttons.filter((b) => b.type === "ticket").length;
  const replyCount = config.buttons.filter((b) => b.type !== "ticket").length;

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**sᴇssɪᴏɴ:** ᴀᴄᴛɪᴠᴇ • **ʙᴜᴛᴛᴏɴs:** ${buttonCount}/${maxButtons} • **ᴛɪᴄᴋᴇᴛs:** ${ticketCount} • **ʀᴇᴘʟɪᴇs:** ${replyCount}`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### sᴇᴛᴜᴘ ᴀᴄᴛɪᴏɴs"),
    );

  const hasTextTicket = config.buttons.some(
    (b) => b.type === "ticket" && b.ticketType === "text",
  );
  const hasVcTicket = config.buttons.some(
    (b) => b.type === "ticket" && b.ticketType === "vc",
  );
  const hasTicketBtn = hasTextTicket || hasVcTicket;
  const full = config.buttons.length >= 3;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tsetup_edit_embed")
      .setLabel("ᴇᴅɪᴛ ᴇᴍʙᴇᴅ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tsetup_add_text_tkt")
      .setLabel("ᴛᴇxᴛ ᴛɪᴄᴋᴇᴛ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(hasTextTicket || full),
    new ButtonBuilder()
      .setCustomId("tsetup_add_vc_tkt")
      .setLabel("ᴠᴄ ᴛɪᴄᴋᴇᴛ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(hasVcTicket || full),
    new ButtonBuilder()
      .setCustomId("tsetup_add_text")
      .setLabel("ᴀᴅᴅ ᴛᴇxᴛ ʀᴇᴘʟʏ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTicketBtn || full),
    new ButtonBuilder()
      .setCustomId("tsetup_add_image")
      .setLabel("ᴀᴅᴅ ɪᴍᴀɢᴇ ʀᴇᴘʟʏ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTicketBtn || full),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tsetup_clear_buttons")
      .setEmoji(icon("WARNING"))
      .setLabel("ᴄʟᴇᴀʀ ᴀʟʟ ʙᴜᴛᴛᴏɴs")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(config.buttons.length === 0),
    new ButtonBuilder()
      .setCustomId("tsetup_publish")
      .setEmoji(icon("DONE"))
      .setLabel(`ᴘᴜʙʟɪsʜ ᴛᴏ #${config.targetChannelName}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(!hasTicketBtn),
    new ButtonBuilder()
      .setCustomId("tsetup_preview")
      .setEmoji(icon("TYPE"))
      .setLabel("ᴘʀᴇᴠɪᴇᴡ")
      .setStyle(ButtonStyle.Secondary),
  );

  container
    .addActionRowComponents(row1)
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("### ᴘᴜʙʟɪsʜ"),
    )
    .addActionRowComponents(row2);

  const payload = {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
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
