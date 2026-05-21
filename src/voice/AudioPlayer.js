import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import { INACTIVITY_TIMEOUT } from "./constants.js";
import { logPlayback } from "../utils/supabaseClient.js";
import { soundCache } from "./SoundCache.js";

export class AudioPlayerManager {
  constructor(guildId) {
    this.guildId = guildId;
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
        maxMissedFrames: Math.round(10000 / 20),
      },
    });
    this.currentSound = null;
    this.startedAt = null;
    this.inactivityTimer = null;
    this.onIdleCallback = null;

    this.setupPlayerEvents();
  }

  /** @private */
  setupPlayerEvents() {
    this.player.on(AudioPlayerStatus.Playing, () => {
      console.log(`[INFO] Now playing: ${this.currentSound?.soundName}`);
      this.clearInactivityTimer();
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[INFO] Playback finished for guild ${this.guildId}`);
      this.currentSound = null;
      this.startedAt = null;

      if (this.onIdleCallback) {
        this.onIdleCallback();
      }

      this.startInactivityTimer();
    });

    this.player.on(AudioPlayerStatus.Paused, () => {
      console.log(`[INFO] Playback paused for guild ${this.guildId}`);
    });

    this.player.on("error", (error) => {
      console.error(
        `[ERROR] Audio player error for guild ${this.guildId}:`,
        error.message,
      );
      this.currentSound = null;
      this.startedAt = null;

      if (this.onIdleCallback) {
        this.onIdleCallback();
      }
    });
  }

  /** Play a sound over the given voice connection. */
  async play(soundData, connection) {
    try {
      console.log(`[INFO] Playing: ${soundData.soundName}`);

      const buffer = await soundCache.get(
        soundData.soundId,
        soundData.soundUrl,
        soundData.soundName,
      );
      const resource = createAudioResource(soundCache.toReadable(buffer), {
        metadata: {
          soundId: soundData.soundId,
          soundName: soundData.soundName,
        },
      });

      connection.subscribe(this.player);

      this.currentSound = {
        soundId: soundData.soundId,
        soundName: soundData.soundName,
        soundUrl: soundData.soundUrl,
        requestedBy: soundData.requestedBy,
      };
      this.startedAt = new Date();

      this.player.play(resource);

      if (soundData.guildId && soundData.channelId && soundData.userId) {
        logPlayback(
          soundData.soundId,
          soundData.guildId,
          soundData.channelId,
          soundData.channelName || null,
          soundData.userId,
          soundData.requestedBy || "Unknown",
        ).catch((err) =>
          console.error("[ERROR] logPlayback failed:", err.message),
        );
      }

      return true;
    } catch (error) {
      console.error("[ERROR] Failed to play audio:", error.message);
      this.currentSound = null;
      return false;
    }
  }

  /** Stop current playback. */
  stop() {
    if (this.player.state.status !== AudioPlayerStatus.Idle) {
      this.player.stop();
      console.log(`[INFO] Stopped playback for guild ${this.guildId}`);
    }
    this.currentSound = null;
    this.startedAt = null;
  }

  /** Pause playback. Returns true if paused. */
  pause() {
    if (this.player.state.status === AudioPlayerStatus.Playing) {
      this.player.pause();
      return true;
    }
    return false;
  }

  /**
   * Resumes paused playback.
   * @returns {boolean} True if resumed, false otherwise.
   */
  resume() {
    if (this.player.state.status === AudioPlayerStatus.Paused) {
      this.player.unpause();
      return true;
    }
    return false;
  }

  /** @returns {{ status, currentSound, startedAt, progress }} */
  getStatus() {
    return {
      status: this.player.state.status,
      currentSound: this.currentSound,
      startedAt: this.startedAt,
      progress: this.getProgress(),
    };
  }

  /** @returns {number} Elapsed seconds since playback started. */
  getProgress() {
    if (!this.startedAt || !this.currentSound) {
      return 0;
    }
    return (Date.now() - this.startedAt.getTime()) / 1000;
  }

  /** @returns {boolean} */
  isPlaying() {
    return this.player.state.status === AudioPlayerStatus.Playing;
  }

  /** Called when the player transitions to Idle. Pass true to signal an inactivity timeout. */
  setOnIdleCallback(callback) {
    this.onIdleCallback = callback;
  }

  /**
   * Starts the inactivity timer.
   * @private
   */
  startInactivityTimer() {
    this.clearInactivityTimer();

    this.inactivityTimer = setTimeout(() => {
      console.log(
        `[INFO] Inactivity timeout reached for guild ${this.guildId}`,
      );
      if (this.onIdleCallback) {
        this.onIdleCallback(true);
      }
    }, INACTIVITY_TIMEOUT);
  }

  /** @private */
  clearInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  /** Stop playback, cancel timers, and destroy the underlying player. */
  destroy() {
    this.clearInactivityTimer();
    this.stop();
    this.player.stop(true);
    console.log(`[INFO] Audio player destroyed for guild ${this.guildId}`);
  }

  /**
   * Gets the underlying @discordjs/voice player instance.
   * @returns {import("@discordjs/voice").AudioPlayer} The audio player.
   */
  getPlayer() {
    return this.player;
  }
}
