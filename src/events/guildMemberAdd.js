import {
  Events,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import { updateStatusMessage } from "../utils/statusUpdater.js";
import { icon } from "../utils/icons.js";
import { addFooter } from "../utils/embed.js";
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

    if (!member.user.bot && config.memberRoleId) {
      try {
        await member.roles.add(config.memberRoleId);
        console.log(`[INFO] Assigned Member role to ${member.user.tag}`);

        const guild = member.guild;
        const approvalsChannel = guild.channels.cache.get(
          config.approvalsChannelId,
        );
        if (approvalsChannel) {
          const userId = member.user.id;
          const displayName = member.displayName || member.user.username;
          const userAvatar = member.user.displayAvatarURL({
            dynamic: true,
            size: 256,
          });

          const section = new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## ${icon("SUCCESS")} ɴᴇᴡ ᴍᴇᴍʙᴇʀ ʜᴀs ᴊᴏɪɴᴇᴅ\n> <@${userId}> ᴊᴏɪɴᴇᴅ ᴛʜᴇ sᴇʀᴠᴇʀ.\n\n${icon("PROFILE")} **ᴍᴇᴍʙᴇʀ : ** <@${userId}>\n\n${icon("TYPE")} **ᴀssɪɢɴᴇᴅ ʀᴏʟᴇ : ** \`Member\`\n\n${icon("EDITOR")} **ɴɪᴄᴋɴᴀᴍᴇ : ** \`${displayName}\``,
              ),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(userAvatar));

          const container = new ContainerBuilder()
            .setAccentColor(0x2ecc71)
            .addSectionComponents(section);

          addFooter(container);

          await approvalsChannel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      } catch (error) {
        console.error(
          `[ERROR] Failed to assign Member role to ${member.user.tag}:`,
          error,
        );
      }
    }

    setTimeout(() => updateStatusMessage(member.client, false), 2000);
  },
};
