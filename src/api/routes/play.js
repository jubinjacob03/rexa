import { Router } from "express";
import voiceManager from "../../voice/VoiceManager.js";
import { getSoundById } from "../../utils/supabaseClient.js";

const router = Router();

/**
 * POST /api/play
 * Play a sound in a voice channel
 */
router.post("/", async (req, res) => {
  try {
    const {
      soundId,
      guildId,
      channelId,
      userId,
      username,
      soundUrl,
      soundName,
    } = req.body;

    if (!soundId || !guildId || !channelId || !userId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "soundId, guildId, channelId, and userId are required",
        },
        timestamp: new Date().toISOString(),
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
        timestamp: new Date().toISOString(),
      });
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== 2) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_CHANNEL",
          message: "Channel must be a voice channel",
        },
        timestamp: new Date().toISOString(),
      });
    }

    let sound;
    if (soundUrl && soundName) {
      sound = { id: soundId, file_url: soundUrl, name: soundName };
    } else {
      sound = await getSoundById(soundId);
      if (!sound) {
        return res.status(404).json({
          success: false,
          error: {
            code: "SOUND_NOT_FOUND",
            message: "Sound not found in database",
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    await voiceManager.joinChannel(guild, channel);

    const soundData = {
      soundId: sound.id,
      soundUrl: sound.file_url,
      soundName: sound.name,
      duration: sound.duration,
      requestedBy: username || "Unknown",
      guildId,
      channelId,
      channelName: channel.name,
      userId,
    };

    const result = await voiceManager.playSound(guildId, soundData);

    const status = voiceManager.getStatus(guildId);

    res.json({
      success: true,
      data: {
        queued: result.queued || false,
        queuePosition: result.queuePosition || 0,
        queueId: result.queueId || null,
        currentlyPlaying: status.currentSound,
        estimatedStartTime: result.queued
          ? new Date(Date.now() + status.queueLength * 30000).toISOString()
          : new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ERROR] Play endpoint error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "PLAYBACK_ERROR",
        message: error.message,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
