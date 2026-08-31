import { WebSocketServer } from "ws";
import crypto from "crypto";

let _zyraSocket = null;
const _pendingRequests = new Map();
const RELAY_SECRET = process.env.ZYRA_RELAY_SECRET || null;
const REQUEST_TIMEOUT = 30_000;

function isValidRelaySecret(candidate) {
  if (!RELAY_SECRET || typeof candidate !== "string") return false;
  const provided = Buffer.from(candidate);
  const expected = Buffer.from(RELAY_SECRET);
  return (
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  );
}

function rejectAllPending(reason) {
  for (const [id, pending] of _pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(new Error(reason));
    _pendingRequests.delete(id);
  }
}

export function getZyraSocket() {
  return _zyraSocket;
}

export function isZyraConnected() {
  return _zyraSocket?.readyState === 1;
}

export function sendToZyra(
  method,
  path,
  body,
  query,
  timeoutMs = REQUEST_TIMEOUT,
) {
  return new Promise((resolve, reject) => {
    if (!isZyraConnected()) {
      return reject(new Error("Zyra not connected"));
    }

    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      _pendingRequests.delete(id);
      reject(new Error("Relay timeout"));
    }, timeoutMs);

    _pendingRequests.set(id, { resolve, reject, timeout });

    _zyraSocket.send(JSON.stringify({ id, method, path, body, query }));
  });
}

let _wss = null;

export function attachZyraRelay() {
  if (!RELAY_SECRET) {
    console.warn(
      "[RELAY] ZYRA_RELAY_SECRET is not set — the Zyra relay will reject all connections until it is configured.",
    );
  }

  _wss = new WebSocketServer({ noServer: true });

  _wss.on("connection", (ws) => {
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
        if (msg.type === "auth" && isValidRelaySecret(msg.secret)) {
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
        rejectAllPending("Zyra disconnected");
        console.log("[RELAY] Zyra disconnected");
      }
    });

    ws.on("error", () => {
      if (_zyraSocket === ws) {
        _zyraSocket = null;
        rejectAllPending("Zyra socket error");
      }
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState === 1) {
        ws.ping();
        ws._pongReceived = false;
        setTimeout(() => {
          if (ws.readyState === 1 && !ws._pongReceived) {
            ws.terminate();
          }
        }, 5000);
      }
    }, 15_000);

    ws.on("pong", () => {
      ws._pongReceived = true;
    });
    ws.on("close", () => clearInterval(heartbeat));
  });

  return { getRelayWss: () => _wss };
}
