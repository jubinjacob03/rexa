import { WebSocketServer } from "ws";
import crypto from "crypto";

let _zyraSocket = null;
const _pendingRequests = new Map();
const RELAY_SECRET = process.env.ZYRA_RELAY_SECRET || "zyra-relay-2026";
const REQUEST_TIMEOUT = 30_000;

export function getZyraSocket() {
  return _zyraSocket;
}

export function isZyraConnected() {
  return _zyraSocket?.readyState === 1;
}

export function sendToZyra(method, path, body, query) {
  return new Promise((resolve, reject) => {
    if (!isZyraConnected()) {
      return reject(new Error("Zyra not connected"));
    }

    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      _pendingRequests.delete(id);
      reject(new Error("Relay timeout"));
    }, REQUEST_TIMEOUT);

    _pendingRequests.set(id, { resolve, reject, timeout });

    _zyraSocket.send(JSON.stringify({ id, method, path, body, query }));
  });
}

export function attachZyraRelay(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws/zyra-relay",
  });

  wss.on("connection", (ws) => {
    ws.authenticated = false;

    const authTimeout = setTimeout(() => {
      if (!ws.authenticated) ws.terminate();
    }, 5000);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (!ws.authenticated) {
        if (msg.type === "auth" && msg.secret === RELAY_SECRET) {
          ws.authenticated = true;
          clearTimeout(authTimeout);

          if (_zyraSocket && _zyraSocket !== ws) {
            _zyraSocket.terminate();
          }
          _zyraSocket = ws;

          ws.send(JSON.stringify({ type: "auth", ok: true }));
          console.log("[RELAY] Zyra connected");
        } else {
          ws.send(JSON.stringify({ type: "auth", ok: false }));
          ws.terminate();
        }
        return;
      }

      if (msg.type === "response" && msg.id) {
        const pending = _pendingRequests.get(msg.id);
        if (pending) {
          clearTimeout(pending.timeout);
          _pendingRequests.delete(msg.id);
          pending.resolve({ status: msg.status, data: msg.data });
        }
      }
    });

    ws.on("close", () => {
      if (_zyraSocket === ws) {
        _zyraSocket = null;
        console.log("[RELAY] Zyra disconnected");
      }
    });

    ws.on("error", () => {
      if (_zyraSocket === ws) _zyraSocket = null;
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState === 1) ws.ping();
    }, 30_000);

    ws.on("close", () => clearInterval(heartbeat));
  });
}
