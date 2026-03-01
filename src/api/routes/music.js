import { Router } from "express";
import http from "http";
import https from "https";
import axios from "axios";

const router = Router();

// ── Persistent keep-alive singleton — one TCP connection reused for all calls.
// Eliminates the ~100–300 ms TCP handshake overhead on each music command.
const makeAgent = (url) =>
  url?.startsWith("https")
    ? new https.Agent({ keepAlive: true, maxSockets: 10 })
    : new http.Agent({ keepAlive: true, maxSockets: 10 });

let _remani = null;
const remani = () => {
  if (!_remani) {
    const baseURL = process.env.REMANI_API_URL || "http://localhost:8000";
    _remani = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${process.env.REMANI_API_KEY || ""}`,
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
      httpAgent:  makeAgent(baseURL),
      httpsAgent: makeAgent(baseURL),
      timeout: 35_000,
    });
  }
  return _remani;
};

const CMD_TIMEOUT = 8_000;

const proxyPost = (remaniPath, timeout = CMD_TIMEOUT) => async (req, res) => {
  try {
    const { data } = await remani().post(remaniPath, req.body, { timeout });
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json(err.response?.data || { error: "Remani API unreachable" });
  }
};

const proxyGet = (remaniPath, getParams) => async (req, res) => {
  try {
    const params = getParams ? getParams(req) : req.query;
    const { data } = await remani().get(remaniPath, { params, timeout: CMD_TIMEOUT });
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json(err.response?.data || { error: "Remani API unreachable" });
  }
};

// ── Play (long timeout — Lavalink search + load)
router.post("/play", proxyPost("/play", 35_000));

// ── Status (polled every 2 s, must be fast)
router.get("/status", proxyGet("/status", (req) => ({ guildId: req.query.guildId })));

// ── Queue details
router.get("/queue", proxyGet("/queue", (req) => ({ guildId: req.query.guildId })));

// ── Health passthrough
router.get("/health", proxyGet("/health"));

// ── Search
router.post("/search", proxyPost("/search", 12_000));

// ── Direct per-action commands (no switch dispatch, minimal payload)
router.post("/skip",    proxyPost("/skip"));
router.post("/pause",   proxyPost("/pause"));
router.post("/resume",  proxyPost("/resume"));
router.post("/toggle",  proxyPost("/toggle"));
router.post("/stop",    proxyPost("/stop"));
router.post("/shuffle", proxyPost("/shuffle"));
router.post("/loop",    proxyPost("/loop"));
router.post("/volume",  proxyPost("/volume"));
router.post("/seek",    proxyPost("/seek"));
router.post("/remove",  proxyPost("/remove"));
router.post("/filter",  proxyPost("/filter"));

// ── Legacy generic control (backward compat)
router.post("/control", proxyPost("/control"));

export default router;
