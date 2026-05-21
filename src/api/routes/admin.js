import { Router } from "express";
import { updateStatusMessage } from "../../utils/statusUpdater.js";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import config from "../../../config.js";
import { icon } from "../../utils/icons.js";
import { addFooter } from "../../utils/embed.js";

const router = Router();

router.post("/refresh", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    await updateStatusMessage(client);
    res.json({ success: true, data: { message: "Status message refreshed." } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/setup-verification", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    const verificationChannel = await guild.channels
      .fetch(config.verificationChannelId)
      .catch(() => null);
    if (!verificationChannel) {
      return res
        .status(404)
        .json({ success: false, error: "Verification channel not found." });
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

    const selfRoleRow1 = new ActionRowBuilder().addComponents(
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

    await verificationChannel.send({
      components: [verificationContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    res.json({
      success: true,
      data: { message: "Verification embed posted." },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
