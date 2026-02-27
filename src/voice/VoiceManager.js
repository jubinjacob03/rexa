import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import { AudioPlayerManager } from "./AudioPlayer.js";
import { Queue } from "./Queue.js";
import { DISCONNECT_TIMEOUT, RECONNECT_TIMEOUT } from "./constants.js";

export class VoiceManager {
  constructor() {
    this.connections = new Map();
    this.players = new Map();
    this.queues = new Map();
    this.lastActivity = new Map();
  }

  /** Join a voice channel, wait for Ready + DAVE epoch, then return the connection. */
  async joinChannel(guild, channel) {
    try {
      const guildId = guild.id;

      let connection = this.connections.get(guildId);

      if (connection) {
        if (connection.joinConfig.channelId === channel.id) {
          console.log(
            `[INFO] Already connected to voice channel in guild ${guildId}`,
          );
          return connection;
        }

        this.leaveChannel(guildId);
      }

      console.log(
        `[INFO] Joining voice channel: ${channel.name} in guild: ${guild.name}`,
      );

      connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guildId,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      this.setupConnectionEvents(connection, guildId);
      this.connections.set(guildId, connection);

      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

        // DAVE: wait for MLS epoch commit before playing
        const dave = connection.state?.networking?.state?.dave;
        if (dave && dave.lastTransitionId === undefined) {
          await new Promise((resolve) => {
            const timeout = setTimeout(resolve, 5000);
            const onDebug = (msg) => {
              if (
                msg.includes("commit") ||
                msg.includes("Transition executed") ||
                msg.includes("passthrough") ||
                msg.includes("epoch")
              ) {
                clearTimeout(timeout);
                dave.off("debug", onDebug);
                setTimeout(resolve, 2500);
              }
            };
            dave.on("debug", onDebug);
          });
        }
      } catch (err) {
        console.error(
          `[ERROR] Voice connection failed to become Ready:`,
          err.message,
        );
        connection.destroy();
        this.connections.delete(guildId);
        throw new Error(
          "Voice connection timed out — could not reach Ready state",
        );
      }

      if (!this.players.has(guildId)) {
        const player = new AudioPlayerManager(guildId);
        player.setOnIdleCallback((timeout) =>
          this.handlePlayerIdle(guildId, timeout),
        );
        this.players.set(guildId, player);
      }

      if (!this.queues.has(guildId)) {
        this.queues.set(guildId, new Queue(guildId));
      }

      this.updateActivity(guildId);

      return connection;
    } catch (error) {
      console.error("[ERROR] Failed to join voice channel:", error);
      throw error;
    }
  }

  /** @private */
  setupConnectionEvents(connection, guildId) {
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        console.log(
          `[WARN] Voice connection disconnected for guild ${guildId}`,
        );

        await Promise.race([
          entersState(
            connection,
            VoiceConnectionStatus.Signalling,
            RECONNECT_TIMEOUT,
          ),
          entersState(
            connection,
            VoiceConnectionStatus.Connecting,
            RECONNECT_TIMEOUT,
          ),
        ]);

        console.log(`[INFO] Reconnection successful for guild ${guildId}`);
      } catch (error) {
        console.error(
          `[ERROR] Reconnection failed for guild ${guildId}:`,
          error,
        );
        this.cleanup(guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log(`[INFO] Voice connection destroyed for guild ${guildId}`);
      this.cleanup(guildId);
    });

    connection.on("error", (error) => {
      console.error(
        `[ERROR] Voice connection error for guild ${guildId}:`,
        error,
      );
    });
  }

  /** Destroy the connection and clean up all resources for a guild. */
  leaveChannel(guildId) {
    const connection = this.connections.get(guildId);

    if (connection) {
      try {
        connection.destroy();
      } catch (error) {
        console.error("[ERROR] Error destroying connection:", error);
      }
    }

    this.cleanup(guildId);
    console.log(`[INFO] Left voice channel for guild ${guildId}`);
  }

  /** Stop any current playback and immediately play the requested sound. */
  async playSound(guildId, soundData) {
    const connection = this.connections.get(guildId);
    const player = this.players.get(guildId);

    if (!connection || !player) {
      throw new Error("Not connected to voice channel");
    }

    // Stop current audio and clear the queue so the new sound plays right away
    if (player.isPlaying()) {
      console.log(
        `[INFO] Interrupting current playback to play: ${soundData.soundName}`,
      );
      player.stop();
      this.queues.get(guildId)?.clear();
    }

    const success = await player.play(soundData, connection);

    if (success) {
      this.updateActivity(guildId);
      return {
        queued: false,
        playing: true,
      };
    } else {
      throw new Error("Failed to start playback");
    }
  }

  /** @private Called when the player goes idle — advances queue or disconnects on timeout. */
  async handlePlayerIdle(guildId, isTimeout = false) {
    const queue = this.queues.get(guildId);
    const player = this.players.get(guildId);
    const connection = this.connections.get(guildId);

    if (!queue || !player || !connection) {
      return;
    }

    if (isTimeout && queue.isEmpty()) {
      console.log(
        `[INFO] Disconnecting due to inactivity for guild ${guildId}`,
      );
      this.leaveChannel(guildId);
      return;
    }

    if (!queue.isEmpty()) {
      const nextSound = queue.next();
      console.log(`[INFO] Playing next in queue: ${nextSound.soundName}`);

      try {
        await player.play(nextSound, connection);
        this.updateActivity(guildId);
      } catch (error) {
        console.error("[ERROR] Failed to play next in queue:", error);
        this.handlePlayerIdle(guildId);
      }
    }
  }

  /** Stop playback and clear the queue. @returns {number} Items cleared. */
  stop(guildId) {
    const player = this.players.get(guildId);
    const queue = this.queues.get(guildId);

    if (player) {
      player.stop();
    }

    if (queue) {
      const cleared = queue.clear();
      return cleared;
    }

    return 0;
  }

  /** @returns {Queue} */
  getQueue(guildId) {
    return this.queues.get(guildId);
  }

  /** @returns {AudioPlayerManager} */
  getPlayer(guildId) {
    return this.players.get(guildId);
  }

  /** @returns {VoiceConnection} */
  getConnection(guildId) {
    return this.connections.get(guildId);
  }

  /** Full playback + queue status snapshot for a guild. */
  getStatus(guildId) {
    const connection = this.connections.get(guildId);
    const player = this.players.get(guildId);
    const queue = this.queues.get(guildId);

    if (!connection) {
      return {
        connected: false,
        lastActivity: this.lastActivity.get(guildId) || null,
      };
    }

    const playerStatus = player ? player.getStatus() : null;
    const queueStatus = queue ? queue.getStatus() : null;

    return {
      connected: true,
      channelId: connection.joinConfig.channelId,
      status: connection.state.status,
      currentSound: playerStatus?.currentSound || null,
      startedAt: playerStatus?.startedAt || null,
      progress: playerStatus?.progress || 0,
      queue: queueStatus?.queue || [],
      queueLength: queueStatus?.length || 0,
      lastActivity: this.lastActivity.get(guildId),
    };
  }

  /** @private */
  updateActivity(guildId) {
    this.lastActivity.set(guildId, new Date().toISOString());
  }

  /** @private Destroy player, clear queue, remove connection entry. */
  cleanup(guildId) {
    const player = this.players.get(guildId);
    if (player) {
      player.destroy();
      this.players.delete(guildId);
    }

    const queue = this.queues.get(guildId);
    if (queue) {
      queue.clear();
      this.queues.delete(guildId);
    }

    this.connections.delete(guildId);

    console.log(`[INFO] Cleaned up resources for guild ${guildId}`);
  }

  /** @returns {string[]} Guild IDs with active connections. */
  getActiveGuilds() {
    return Array.from(this.connections.keys());
  }

  /** Disconnect from every voice channel (e.g. on shutdown). */
  disconnectAll() {
    console.log("[INFO] Disconnecting from all voice channels");
    const guildIds = Array.from(this.connections.keys());

    for (const guildId of guildIds) {
      this.leaveChannel(guildId);
    }
  }
}

const voiceManager = new VoiceManager();

export default voiceManager;
