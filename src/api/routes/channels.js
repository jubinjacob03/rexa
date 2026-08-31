import { Router } from "express";
import { ChannelType } from "discord.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { guildId } = req.query;

    if (!guildId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_GUILD_ID",
          message: "guildId query param is required",
        },
      });
    }

    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
      return res.status(404).json({
        success: false,
        error: {
          code: "GUILD_NOT_FOUND",
          message: "Bot is not in the specified guild",
        },
      });
    }

    const voiceChannels = guild.channels.cache
      .filter((ch) => ch.type === ChannelType.GuildVoice)
      .map((ch) => ({
        id: ch.id,
        name: ch.name,
        memberCount: ch.members.size,
        memberIds: [...ch.members.keys()],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.json({
      success: true,
      data: voiceChannels,
    });
  } catch (error) {
    console.error("[channels] Error:", error);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch channels" },
    });
  }
});

export default router;
