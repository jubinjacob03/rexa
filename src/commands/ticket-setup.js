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
import { EMBED_COLOR, addFooter, eReply } from "../utils/embed.js";
import { icon } from "../utils/icons.js";
import { checkModerationPermission } from "../utils/moderation.js";

export const setupSessions = new Map();

// Cleanup abandoned setup sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of setupSessions.entries()) {
    if (now - session.timestamp > 30 * 60 * 1000) {
      setupSessions.delete(userId);
    }
  }
}, 30 * 60 * 1000);

/**
 * Command to launch the Advanced Ticket Setup Dashboard.
 * @module setupTicketCommand
 */
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

  /**
   * Executes the setup-ticket command.
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The interaction object.
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    // Check if the user has moderation permissions
    if (!(await checkModerationPermission(interaction.guild, interaction.user.id, "mod"))) {
      return interaction.reply(eReply("Notice", "Admins only."));
    }
    
    const targetChannel = interaction.options.getChannel("channel");
    const advanced = interaction.options.getBoolean("advanced") || false;

    // If not advanced, publish the simple ticket panel directly
    if (!advanced) {
      await publishSimpleTicketPanel(interaction, targetChannel);
      return;
    }

    // Fetch ticket mods configuration from Supabase
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
        } catch {
          // Ignore parsing errors
        }
      }
    }

    // Initialize the setup session for the user
    setupSessions.set(interaction.user.id, {
      title: "🎟️ sᴜᴘᴘᴏʀᴛ ᴛɪᴄᴋᴇᴛs",
      description:
        "ᴄʟɪᴄᴋ ᴛʜᴇ ʙᴜᴛᴛᴏɴ ʙᴇʟᴏᴡ ᴛᴏ ᴏᴘᴇɴ ᴀ ᴘʀɪᴠᴀᴛᴇ ᴛɪᴄᴋᴇᴛ.\nᴏᴜʀ ᴀɪ ᴀssɪsᴛᴀɴᴛ ᴀɴᴅ sᴛᴀғғ ᴡɪʟʟ ʙᴇ ᴡɪᴛʜ ʏᴏᴜ sʜᴏʀᴛʟʏ.",
      color: EMBED_COLOR,
      targetChannelId: targetChannel.id,
      targetChannelName: targetChannel.name,
      buttons: [],
      ticketMods,
      timestamp: Date.now(),
    });

    await renderTicketDashboard(interaction);
  },
};

/**
 * Publishes a simple ticket panel to the target channel.
 * @param {import("discord.js").ChatInputCommandInteraction} interaction - The interaction object.
 * @param {import("discord.js").TextBasedChannel} targetChannel - The channel to publish the panel to.
 * @returns {Promise<void>}
 */
async function publishSimpleTicketPanel(interaction, targetChannel) {
  const serverIcon = interaction.guild.iconURL({ size: 128 });
  const panelContainer = new ContainerBuilder()
    .setAccentColor(EMBED_COLOR);

  // Add server icon as thumbnail if available
  if (serverIcon) {
    panelContainer.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ᴛɪᴄᴋᴇᴛ sᴜᴘᴘᴏʀᴛ\nᴄʟɪᴄᴋ ᴛʜᴇ ʙᴜᴛᴛᴏɴ ʙᴇʟᴏᴡ ᴀɴᴅ ᴇɴᴛᴇʀ ʏᴏᴜʀ ǫᴜᴇʀʏ ᴛᴏ \nᴏᴘᴇɴ ᴀ ᴘʀɪᴠᴀᴛᴇ ᴛɪᴄᴋᴇᴛ.`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(serverIcon))
    );
  } else {
    panelContainer.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ᴛɪᴄᴋᴇᴛ sᴜᴘᴘᴏʀᴛ\nᴄʟɪᴄᴋ ᴛʜᴇ ʙᴜᴛᴛᴏɴ ʙᴇʟᴏᴡ ᴀɴᴅ ᴇɴᴛᴇʀ ʏᴏᴜʀ ǫᴜᴇʀʏ ᴛᴏ \nᴏᴘᴇɴ ᴀ ᴘʀɪᴠᴀᴛᴇ ᴛɪᴄᴋᴇᴛ.`
      )
    );
  }

  // Add the create ticket button
  panelContainer.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("tkt_open_simple")
          .setLabel("ᴄʀᴇᴀᴛᴇ ᴛɪᴄᴋᴇᴛ")
          .setEmoji(icon("TICKET"))
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  addFooter(panelContainer);

  await targetChannel.send({
    components: [panelContainer],
    flags: MessageFlags.IsComponentsV2,
  }).catch(err => console.error("[TicketSetup] Failed to send simple ticket panel:", err));

  await interaction.reply(
    eReply(
      `${icon("SUCCESS")} sᴜᴄᴄᴇss`,
      `ᴛɪᴄᴋᴇᴛ ᴘᴀɴᴇʟ ᴄʀᴇᴀᴛᴇᴅ ɪɴ <#${targetChannel.id}>.`
    )
  ).catch(() => {});
}

/**
 * Renders the advanced ticket setup dashboard.
 * @param {import("discord.js").ChatInputCommandInteraction|import("discord.js").ButtonInteraction} interaction - The interaction object.
 * @param {boolean} [isUpdate=false] - Whether this is an update to an existing message.
 * @returns {Promise<void>}
 */
export async function renderTicketDashboard(interaction, isUpdate = false) {
  const config = setupSessions.get(interaction.user.id);
  if (!config) return;

  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
  const iconUrl = interaction.guild?.iconURL({ size: 256, dynamic: true });
  const headerContent = `## ${icon("EDITOR")} ᴛɪᴄᴋᴇᴛ ᴇᴅɪᴛᴏʀ\nᴜsᴇ ᴛʜᴇ ᴄᴏɴᴛʀᴏʟs ʙᴇʟᴏᴡ ᴛᴏ ᴄᴏɴғɪɢᴜʀᴇ ᴀɴᴅ ᴘᴜʙʟɪsʜ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ ᴘᴀɴᴇʟ.\n\n**ᴛᴀʀɢᴇᴛ:** <#${config.targetChannelId}>`;

  // Add header with optional server icon
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

  // Calculate button statistics
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

  // Determine button states based on current configuration
  const hasTextTicket = config.buttons.some(
    (b) => b.type === "ticket" && b.ticketType === "text",
  );
  const hasVcTicket = config.buttons.some(
    (b) => b.type === "ticket" && b.ticketType === "vc",
  );
  const hasTicketBtn = hasTextTicket || hasVcTicket;
  const full = config.buttons.length >= 3;

  // Build setup action buttons
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

  // Build publish and preview buttons
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

  // Send or update the dashboard message
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
