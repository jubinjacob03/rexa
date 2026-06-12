import { WebSocketServer } from "ws";
import { consumeToken } from "./wsTokens.js";
import voiceManager from "../voice/VoiceManager.js";
import { soundCache } from "../voice/SoundCache.js";

let _wss = null;

/**
 * Broadcasts a JSON payload to all authenticated WebSocket clients.
 * @param {Object} payload - The data to broadcast.
 */
export function broadcastWs(payload) {
  if (!_wss) return;
  const data = JSON.stringify(payload);
  for (const client of _wss.clients) {
    if (client.authenticated && client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

/** @param {import('http').Server} httpServer */
export function attachWsServer(httpServer, discordClient) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  _wss = wss;

  wss.on("connection", (ws) => {
    ws.authenticated = false;

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (!ws.authenticated) {
        if (msg.type === "auth" && consumeToken(msg.token)) {
          ws.authenticated = true;
          send(ws, { type: "auth", ok: true });
        } else {
          send(ws, {
            type: "auth",
            ok: false,
            error: "Invalid or expired token",
          });
          ws.terminate();
        }
        return;
      }

      if (msg.type === "play") {
        const now = Date.now();
        if (ws.lastPlayAt && now - ws.lastPlayAt < 1000) {
          send(ws, {
            type: "play_result",
            id: msg.id,
            ok: false,
            error: "Rate limited — slow down.",
          });
          return;
        }
        ws.lastPlayAt = now;

        const {
          id,
          soundId,
          soundUrl,
          soundName,
          guildId,
          channelId,
          channelName,
          userId,
          username,
        } = msg;

        if (!soundId || !soundUrl || !guildId || !channelId) {
          send(ws, {
            type: "play_result",
            id,
            ok: false,
            error: "Missing required fields.",
          });
          return;
        }

        try {
          const guild = discordClient.guilds.cache.get(guildId);
          if (!guild) throw new Error("Guild not found");

          const channel = guild.channels.cache.get(channelId);
          if (!channel || channel.type !== 2)
            throw new Error("Invalid voice channel");

          await voiceManager.joinChannel(guild, channel);

          const result = await voiceManager.playSound(guildId, {
            soundId,
            soundUrl,
            soundName,
            requestedBy: username || "Unknown",
            guildId,
            channelId,
            channelName: channelName || channel.name,
            userId,
          });

          send(ws, { type: "play_result", id, ok: true, data: result });
        } catch (err) {
          console.error("[ERROR] WS play command failed:", err.message);
          send(ws, { type: "play_result", id, ok: false, error: err.message });
        }
        return;
      }

      if (msg.type === "cache_invalidate" && msg.soundId) {
        soundCache.invalidate(msg.soundId);
        send(ws, { type: "cache_invalidate_ack", soundId: msg.soundId });
        return;
      }
    });

    ws.on("error", (err) =>
      console.error("[ERROR] WS client error:", err.message),
    );
  });

  wss.on("error", (err) =>
    console.error("[ERROR] WS server error:", err.message),
  );

  console.log("[INFO] WebSocket server attached at /ws");
  return wss;
}

/**
 * Sends a JSON payload to a specific WebSocket client.
 * @param {import('ws').WebSocket} ws - The WebSocket client.
 * @param {Object} payload - The data to send.
 */
function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}
