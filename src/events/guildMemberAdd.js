import {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { updateStatusMessage } from "../utils/statusUpdater.js";
import { getAutoDmEnabled } from "../utils/verificationHandler.js";
import config from "../../config.js";

export default {
  name: Events.GuildMemberAdd,
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

    if (!member.user.bot && getAutoDmEnabled()) {
      try {
        const verificationEmbed = new EmbedBuilder()
          .setColor("#00ddff")
          .setTitle("🔐 ʀᴏʟᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ")
          .setDescription(
            "**ᴄʟɪᴄᴋ ᴏɴ ᴛʜᴇ ᴀᴘᴘʀᴏᴘʀɪᴀᴛᴇ ʀᴏʟᴇ ʏᴏᴜ ᴡᴀɴᴛ ᴛᴏ ᴀᴘᴘʟʏ.** ",
          )
          .setTimestamp();

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

        await member.send({
          embeds: [verificationEmbed],
          components: [buttonRow],
        });
        console.log(`[INFO] Sent auto verification DM to ${member.user.tag}`);
      } catch (error) {
        console.warn(
          `[WARN] Could not send verification DM to ${member.user.tag}: ${error.message}`,
        );
      }
    }

    setTimeout(() => updateStatusMessage(member.client), 2000);
  },
};
