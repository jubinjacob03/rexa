import { Router } from "express";
import voiceManager from "../../voice/VoiceManager.js";

const router = Router();

/**
 * GET /api/status
 * Returns the overall status of the bot, including voice connections and guild stats.
 */
router.get("/", async (req, res) => {
  try {
    const client = req.app.get("discordClient");

    const guilds = client.guilds.cache.map((guild) => {
      const voiceStatus = voiceManager.getStatus(guild.id);
      return {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        voice: voiceStatus,
      };
    });

    res.json({
      success: true,
      data: {
        uptime: Math.floor(client.uptime / 1000), // convert ms to seconds
        ping: client.ws.ping,
        guilds: client.guilds.cache.size,
        voiceConnections: voiceManager.getActiveGuilds().length,
        totalUsers: client.users.cache.size,
        totalChannels: client.channels.cache.size,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ERROR] Status endpoint error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "STATUS_ERROR",
        message: error.message,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
