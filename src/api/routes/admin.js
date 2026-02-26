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

// POST /api/admin/setup-verification — re-post verification embeds
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

    const friendsEmbed = new EmbedBuilder()
      .setColor("#0099FF")
      .setTitle("🌟 ғʀɪᴇɴᴅs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ")
      .setDescription("ᴀᴘᴘʟʏ ғᴏʀ **ғʀɪᴇɴᴅs** ʀᴏʟᴇ ɪғ ʏᴏᴜ ᴀʀᴇ ᴀ **ᴠɪsɪᴛᴏʀ** ɪɴ ᴛʜᴇ sᴇʀᴠᴇʀ.")
      .addFields(
        { name: "ᴘᴜʀᴘᴏsᴇ", value: "ғᴏʀ ᴠɪsɪᴛᴏʀs", inline: true },
        { name: "ᴀᴄᴄᴇss ʟᴇᴠᴇʟ", value: "ʙᴀsɪᴄ", inline: true },
        { name: "ᴘᴇʀᴍɪssɪᴏɴs", value: "ʟɪᴍɪᴛᴇᴅ ᴄʜᴀɴɴᴇʟs", inline: true }
      )
      .setTimestamp();

    const friendsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("verify_friends")
        .setLabel("ᴀᴘᴘʟʏ")
        .setStyle(ButtonStyle.Primary)
    );

    const memberEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("👑 ᴍᴇᴍʙᴇʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ")
      .setDescription("ᴀᴘᴘʟʏ ғᴏʀ **ᴍᴇᴍʙᴇʀ** ʀᴏʟᴇ ɪғ ʏᴏᴜ ᴀʀᴇ ᴀ **ɢᴜɪʟᴅᴍᴀᴛᴇ** ɪɴ sᴀɪʏᴀɴ ɢᴏᴅs.")
      .addFields(
        { name: "ᴘᴜʀᴘᴏsᴇ", value: "ɢᴜɪʟᴅᴍᴀᴛᴇs", inline: true },
        { name: "ᴀᴄᴄᴇss ʟᴇᴠᴇʟ", value: "ғᴜʟʟ ᴀᴄᴄᴇss", inline: true },
        { name: "ᴘᴇʀᴍɪssɪᴏɴs", value: "ᴀʟʟ ᴄʜᴀɴɴᴇʟs", inline: true }
      )
      .setTimestamp();

    const memberRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("verify_member")
        .setLabel("ᴀᴘᴘʟʏ")
        .setStyle(ButtonStyle.Success)
    );

    await verificationChannel.send({ embeds: [friendsEmbed], components: [friendsRow] });
    await verificationChannel.send({ embeds: [memberEmbed], components: [memberRow] });

    res.json({ success: true, data: { message: "Verification embeds posted." } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
