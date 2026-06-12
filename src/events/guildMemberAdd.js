import {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import { updateStatusMessage } from "../utils/statusUpdater.js";
import { icon } from "../utils/icons.js";
import { getAutoDmEnabled } from "../utils/verificationHandler.js";
import { addFooter } from "../utils/embed.js";
import config from "../../config.js";

/**
 * Handles the GuildMemberAdd event.
 * @module events/guildMemberAdd
 */
export default {
  name: Events.GuildMemberAdd,
  /**
   * Executes the event handler.
   * @param {import("discord.js").GuildMember} member - The member that joined the guild.
   * @returns {Promise<void>}
   */
  async execute(member) {
    console.log(`[INFO] Member joined: ${member.user.tag}`);

    if (member.user.bot && config.botRoleId) {
      try {
        await member.roles.add(config.botRoleId);
        console.log(`[INFO] Assigned Bot role to ${member.user.tag}`);
      } catch (error) {
        console.error(
          `[ERROR] Failed to assign Bot role to ${member.user.tag}:`,
          error,
        );
      }
    }

    if (!member.user.bot && (await getAutoDmEnabled())) {
      try {
        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("dev_check")
            .setLabel("ᴅᴇᴠ ᴄʜᴇᴄᴋ")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("verify_member")
            .setLabel("ᴍᴇᴍʙᴇʀ")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("verify_moderator")
            .setLabel("ᴍᴏᴅᴇʀᴀᴛᴏʀ")
            .setStyle(ButtonStyle.Success),
        );

        const selfRoleRow1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("selfrole_pc")
            .setLabel("PC")
            .setEmoji("💻")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("selfrole_mobile")
            .setLabel("Mobile")
            .setEmoji("📱")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("selfrole_mobile_pc")
            .setEmoji("📲")
            .setStyle(ButtonStyle.Secondary),
        );

        const selfRoleRow2 = new ActionRowBuilder().addComponents(
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
          .addActionRowComponents(selfRoleRow1, selfRoleRow2);

        addFooter(verificationContainer);

        await member.send({
          components: [verificationContainer],
          flags: MessageFlags.IsComponentsV2,
        });
        console.log(`[INFO] Sent auto verification DM to ${member.user.tag}`);
      } catch (error) {
        console.warn(
          `[WARN] Could not send verification DM to ${member.user.tag}: ${error.message}`,
        );
      }
    }

    setTimeout(() => updateStatusMessage(member.client, false), 2000);
  },
};
