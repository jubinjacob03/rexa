import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import config from "../../config.js";
import {
  getAutoDmEnabled,
  setAutoDmEnabled,
  getAutoApprove,
  setAutoApprove,
} from "../utils/verificationHandler.js";
import { eReply, addFooter } from "../utils/embed.js";
import { i, icon } from "../utils/icons.js";
import { checkModerationPermission } from "../utils/moderation.js";

/**
 * Command to set up verification embeds in the verification channel.
 * @module setupVerificationCommand
 */
export default {
  data: new SlashCommandBuilder()
    .setName("setup-verification")
    .setDescription("Set up verification embeds in the verification channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("auto")
        .setDescription(
          "Auto-DM new members with the verification embed when they join (default: off)",
        )
        .setRequired(false)
        .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" }),
    )
    .addStringOption((option) =>
      option
        .setName("approve")
        .setDescription(
          "auto: AI DM auto-grants role. manual: sends to #approvals for human review.",
        )
        .setRequired(false)
        .addChoices(
          { name: "auto", value: "auto" },
          { name: "manual", value: "manual" },
        ),
    ),

  /**
   * Executes the setup-verification command.
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The interaction object.
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    if (
      !(await checkModerationPermission(
        interaction.guild,
        interaction.user.id,
        "mod",
      ))
    ) {
      return interaction.reply(eReply("Notice", "Admins only."));
    }

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      const autoOption = interaction.options.getString("auto");
      if (autoOption !== null) {
        const enabled = autoOption === "on";
        await setAutoDmEnabled(enabled);
      }

      const approveOption = interaction.options.getString("approve");
      if (approveOption !== null) {
        await setAutoApprove(approveOption === "auto");
      }

      const currentAutoDm = await getAutoDmEnabled();
      const currentAutoApprove = await getAutoApprove();

      const verificationChannel = await interaction.guild.channels.fetch(
        config.verificationChannelId,
      );

      if (!verificationChannel) {
        return interaction.editReply(
          eReply(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴄʜᴀɴɴᴇʟ ɴᴏᴛ ғᴏᴜɴᴅ!"),
        );
      }

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("dev_check")
          .setLabel("ᴅᴇᴠ ᴄʜᴇᴄᴋ")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("verify_friends")
          .setLabel("ғʀɪᴇɴᴅs")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("verify_member")
          .setLabel("ɢᴜɪʟᴅ-ᴍᴇᴍʙᴇʀ")
          .setStyle(ButtonStyle.Success),
      );

      const selfRoleRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("selfrole_pc")
          .setEmoji("💻")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("selfrole_mobile")
          .setEmoji("📱")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("selfrole_mobile_pc")
          .setEmoji("📲")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("selfrole_18_plus")
          .setEmoji(icon("18PLUS"))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("selfrole_18_minus")
          .setEmoji(icon("18MINUS"))
          .setStyle(ButtonStyle.Secondary),
      );

      const verificationContainer = new ContainerBuilder()
        .setAccentColor(0x00ddff)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${icon("KEYLOCK")} ʀᴏʟᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ\nᴄʟɪᴄᴋ ᴛʜᴇ ʀᴏʟᴇ ʏᴏᴜ ᴡᴀɴᴛ ᴛᴏ ᴀᴘᴘʟʏ.`,
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small),
        )
        .addActionRowComponents(buttonRow)
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("### sᴇʟғ-ʀᴏʟᴇs"),
        )
        .addActionRowComponents(selfRoleRow);

      addFooter(verificationContainer);

      const payload = {
        components: [verificationContainer],
        flags: MessageFlags.IsComponentsV2,
      };

      const messages = await verificationChannel.messages.fetch({ limit: 10 });
      let existingMessage = null;

      const VERIF_NEEDLES = [
        "role verification",
        "ʀᴏʟᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ",
        "friends verification",
        "ғʀɪᴇɴᴅs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ",
        "member verification",
        "ᴍᴇᴍʙᴇʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ",
      ];

      const matchesVerif = (haystack) => {
        if (!haystack) return false;
        const lc = haystack.toLowerCase();
        return VERIF_NEEDLES.some((n) => lc.includes(n));
      };

      messages.forEach((msg) => {
        if (msg.author.id !== interaction.client.user.id) return;
        if (
          matchesVerif(msg.embeds[0]?.title) ||
          matchesVerif(msg.embeds[0]?.description)
        ) {
          if (!existingMessage) existingMessage = msg;
          return;
        }
        const flat = JSON.stringify(msg.components ?? []);
        if (matchesVerif(flat)) {
          if (!existingMessage) existingMessage = msg;
          return;
        }
        const ids = JSON.stringify(msg.components ?? []);
        if (
          ids.includes("verify_friends") ||
          ids.includes("verify_member") ||
          ids.includes("dev_check")
        ) {
          if (!existingMessage) existingMessage = msg;
        }
      });

      if (existingMessage) {
        const isLegacy = existingMessage.embeds?.length > 0;
        if (isLegacy) {
          await existingMessage.delete().catch(() => {});
          await verificationChannel
            .send(payload)
            .catch((err) =>
              console.error(
                "[SetupVerification] Failed to send new embed:",
                err,
              ),
            );
        } else {
          await existingMessage
            .edit(payload)
            .catch((err) =>
              console.error(
                "[SetupVerification] Failed to edit existing embed:",
                err,
              ),
            );
        }
        console.log("[INFO] Updated existing verification message");

        const stale = messages.filter(
          (msg) =>
            msg.id !== existingMessage.id &&
            msg.author.id === interaction.client.user.id &&
            (matchesVerif(msg.embeds[0]?.title) ||
              matchesVerif(msg.embeds[0]?.description) ||
              matchesVerif(JSON.stringify(msg.components ?? []))),
        );

        for (const msg of stale.values()) {
          await msg.delete().catch(() => {});
          console.log("[INFO] Deleted stale verification message");
        }

        await interaction.editReply(
          eReply(
            `${i("SUCCESS")} ᴜᴘᴅᴀᴛᴇᴅ`,
            `ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴇᴍʙᴇᴅ ᴜᴘᴅᴀᴛᴇᴅ.\n\n${icon("MAILBOX")} ᴀᴜᴛᴏ-ᴅᴍ ᴏɴ ᴊᴏɪɴ: **${currentAutoDm ? "on" : "off"}**\n${icon("BOT")} ᴀᴘᴘʀᴏᴠᴇ ᴍᴏᴅᴇ: **${currentAutoApprove ? "auto (AI DM)" : "manual (approvals channel)"}**`,
          ),
        );
      } else {
        await verificationChannel
          .send(payload)
          .catch((err) =>
            console.error("[SetupVerification] Failed to send new embed:", err),
          );
        console.log("[INFO] Created new verification embed");
        await interaction.editReply(
          eReply(
            `${i("SUCCESS")} ᴄᴏᴍᴘʟᴇᴛᴇ`,
            `ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴇᴍʙᴇᴅ ᴄʀᴇᴀᴛᴇᴅ.\n\n${icon("MAILBOX")} ᴀᴜᴛᴏ-ᴅᴍ ᴏɴ ᴊᴏɪɴ: **${currentAutoDm ? "on" : "off"}**\n${icon("BOT")} ᴀᴘᴘʀᴏᴠᴇ ᴍᴏᴅᴇ: **${currentAutoApprove ? "auto (AI DM)" : "manual (approvals channel)"}**`,
          ),
        );
      }
    } catch (error) {
      console.error("[ERROR] Error setting up verification:", error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(
          eReply(`${i("ERROR")} ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ sᴇᴛ ᴜᴘ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴇᴍʙᴇᴅ."),
        );
      } else {
        await interaction.reply(
          eReply(`${i("ERROR")} ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ sᴇᴛ ᴜᴘ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴇᴍʙᴇᴅ."),
        );
      }
    }
  },
};
