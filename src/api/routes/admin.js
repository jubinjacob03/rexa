import { Router } from "express";
import { updateStatusMessage } from "../../utils/statusUpdater.js";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import config from "../../../config.js";

const router = Router();

// POST /api/admin/refresh — refresh server status message
router.post("/refresh", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    await updateStatusMessage(client);
    res.json({ success: true, data: { message: "Status message refreshed." } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/setup-verification — re-post verification embed
router.post("/setup-verification", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return res.status(503).json({ success: false, error: "Guild not found" });

    const verificationChannel = await guild.channels
      .fetch(config.verificationChannelId)
      .catch(() => null);
    if (!verificationChannel) {
      return res.status(404).json({ success: false, error: "Verification channel not found." });
    }

    const verificationEmbed = new EmbedBuilder()
      .setColor("#00ddff")
      .setTitle("🔐 ʀᴏʟᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ")
      .setDescription("ᴄʟɪᴄᴋ ᴏɴ ᴛʜᴇ ᴀᴘᴘʀᴏᴘʀɪᴀᴛᴇ ʀᴏʟᴇ ʏᴏᴜ ᴡᴀɴᴛ ᴛᴏ ᴀᴘᴘʟʏ. ⚠️ **ᴍᴇᴍʙᴇʀ ɪs ғᴏʀ ɢᴜɪʟᴅᴍᴀᴛᴇs ᴏɴʟʏ!!**")
      .setTimestamp();

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("verify_friends")
        .setLabel("ғʀɪᴇɴᴅs")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("verify_member")
        .setLabel("ᴍᴇᴍʙᴇʀ")
        .setStyle(ButtonStyle.Success)
    );

    await verificationChannel.send({ embeds: [verificationEmbed], components: [buttonRow] });

    res.json({ success: true, data: { message: "Verification embed posted." } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
