import { Router } from "express";
import http from "http";
import https from "https";
import axios from "axios";

const router = Router();

/**
 * Creates a persistent keep-alive agent for HTTP/HTTPS requests.
 * @param {string} url - The base URL to determine the protocol.
 * @returns {http.Agent|https.Agent} The configured agent.
 */
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
      httpAgent: makeAgent(baseURL),
      httpsAgent: makeAgent(baseURL),
      timeout: 35_000,
    });
  }
  return _remani;
};

const CMD_TIMEOUT = 8_000;

/**
 * Creates a proxy middleware for POST requests to the Remani API.
 * @param {string} remaniPath - The path to proxy to.
 * @param {number} [timeout=CMD_TIMEOUT] - The request timeout in milliseconds.
 * @returns {import('express').RequestHandler} The Express request handler.
 */
const proxyPost =
  (remaniPath, timeout = CMD_TIMEOUT) =>
  async (req, res) => {
    try {
      const { data } = await remani().post(remaniPath, req.body, { timeout });
      res.json(data);
    } catch (err) {
      const status = err.response?.status || 502;
      res
        .status(status)
        .json(err.response?.data || { error: "Remani API unreachable" });
    }
  };

const proxyGet = (remaniPath, getParams) => async (req, res) => {
  try {
    const params = getParams ? getParams(req) : req.query;
    const { data } = await remani().get(remaniPath, {
      params,
      timeout: CMD_TIMEOUT,
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res
      .status(status)
      .json(err.response?.data || { error: "Remani API unreachable" });
  }
};

const _proxyDelete = (remaniPath) => async (req, res) => {
  try {
    const { data } = await remani().delete(remaniPath, {
      data: req.body,
      timeout: CMD_TIMEOUT,
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res
      .status(status)
      .json(err.response?.data || { error: "Remani API unreachable" });
  }
};

router.post("/play", proxyPost("/play", 35_000));

router.get(
  "/status",
  proxyGet("/status", (req) => ({ guildId: req.query.guildId })),
);

router.get(
  "/queue",
  proxyGet("/queue", (req) => ({ guildId: req.query.guildId })),
);

router.get("/health", proxyGet("/health"));

router.post("/search", proxyPost("/search", 12_000));

router.post("/skip", proxyPost("/skip"));
router.post("/pause", proxyPost("/pause"));
router.post("/resume", proxyPost("/resume"));
router.post("/toggle", proxyPost("/toggle"));
router.post("/stop", proxyPost("/stop"));
router.post("/shuffle", proxyPost("/shuffle"));
router.post("/loop", proxyPost("/loop"));
router.post("/volume", proxyPost("/volume"));
router.post("/remove", proxyPost("/remove"));

router.post("/control", proxyPost("/control"));

export default router;
