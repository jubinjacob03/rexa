import { Router } from "express";
import http from "http";
import https from "https";
import axios from "axios";
import { isZyraConnected, sendToZyra } from "../zyraRelay.js";

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

let remaniInstances = {};
const getRemaniInstance = (botIndex = 0) => {
  if (!remaniInstances[botIndex]) {
    let baseURL = process.env.REMANI_API_URL || "http://localhost:8000";
    if (botIndex > 0) {
      const envUrl = process.env[`REMANI_API_URL_${botIndex}`];
      if (envUrl) {
        baseURL = envUrl;
      } else {
        if (baseURL.includes("localhost") || baseURL.includes("127.0.0.1")) {
          baseURL = baseURL.replace(/:8000$/, `:${8000 + botIndex}`);
        } else {
          try {
            const urlObj = new URL(baseURL);
            if (urlObj.port) {
              urlObj.port = String(8000 + botIndex);
              baseURL = urlObj.toString();
            }
          } catch {
            baseURL = baseURL.replace(/:8000$/, `:${8000 + botIndex}`);
          }
        }
      }
    }
    remaniInstances[botIndex] = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${process.env[`REMANI_API_KEY_${botIndex}`] || process.env.REMANI_API_KEY || ""}`,
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
      httpAgent: makeAgent(baseURL),
      httpsAgent: makeAgent(baseURL),
      timeout: 35_000,
    });
  }
  return remaniInstances[botIndex];
};

const CMD_TIMEOUT = 8_000;

const proxyPost =
  (remaniPath, timeout = CMD_TIMEOUT) =>
  async (req, res) => {
    try {
      if (isZyraConnected()) {
        const result = await sendToZyra("POST", remaniPath, req.body);
        return res.status(result.status || 200).json(result.data);
      }
      const botIndex =
        req.body.botIndex !== undefined ? Number(req.body.botIndex) : 0;
      const { data } = await getRemaniInstance(botIndex).post(
        remaniPath,
        req.body,
        { timeout },
      );
      res.json(data);
    } catch (err) {
      const status = err.response?.status || 502;
      res
        .status(status)
        .json(
          err.response?.data || {
            error: err.message || "Remani API unreachable",
          },
        );
    }
  };

const proxyGet = (remaniPath, getParams) => async (req, res) => {
  try {
    if (isZyraConnected()) {
      const params = getParams ? getParams(req) : req.query;
      const result = await sendToZyra("GET", remaniPath, null, params);
      return res.status(result.status || 200).json(result.data);
    }
    const botIndex =
      req.query.botIndex !== undefined ? Number(req.query.botIndex) : 0;
    const params = getParams ? getParams(req) : req.query;
    const { data } = await getRemaniInstance(botIndex).get(remaniPath, {
      params,
      timeout: CMD_TIMEOUT,
    });
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res
      .status(status)
      .json(
        err.response?.data || {
          error: err.message || "Remani API unreachable",
        },
      );
  }
};

const _proxyDelete = (remaniPath) => async (req, res) => {
  try {
    const botIndex =
      req.body.botIndex !== undefined ? Number(req.body.botIndex) : 0;
    const { data } = await getRemaniInstance(botIndex).delete(remaniPath, {
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

router.get("/trending", proxyGet("/trending"));

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
