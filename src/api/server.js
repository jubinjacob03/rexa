import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import config from "../../config.js";
import { authenticateApiKey } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

import playRoute from "./routes/play.js";
import statusRoute from "./routes/status.js";
import channelsRoute from "./routes/channels.js";
import wsTokenRoute from "./routes/wsToken.js";
import privateVcRoute from "./routes/privateVc.js";
import adminRoute from "./routes/admin.js";
import membersRoute from "./routes/members.js";
import verificationRoute from "./routes/verification.js";
import musicRoute from "./routes/music.js";
import { attachWsServer } from "./wsServer.js";
import { attachZyraRelay } from "./zyraRelay.js";

/**
 * Creates and configures the Express API server.
 * @param {import('discord.js').Client} discordClient - The Discord client instance.
 * @returns {import('express').Express} The configured Express application.
 */
export function createApiServer(discordClient) {
  const app = express();

  app.set("discordClient", discordClient);

  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: config.api.allowedOrigins,
      methods: ["GET", "POST", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(
    morgan("tiny", {
      skip: (req, res) => {
        if (res.statusCode >= 500) return false;
        return req.method === "GET" || res.statusCode === 404;
      },
    }),
  );

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    message: {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests",
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api", limiter);

  const wsTokenLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many token requests",
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get("/health", (req, res) => {
    res.json({
      success: true,
      data: {
        status: "healthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use("/api/play", authenticateApiKey, playRoute);
  app.use("/api/status", authenticateApiKey, statusRoute);
  app.use("/api/channels", authenticateApiKey, channelsRoute);
  app.use("/api/ws-token", wsTokenLimiter, authenticateApiKey, wsTokenRoute);
  app.use("/api/private-vc", authenticateApiKey, privateVcRoute);
  app.use("/api/admin", authenticateApiKey, adminRoute);
  app.use("/api/members", authenticateApiKey, membersRoute);
  app.use("/api/verification", authenticateApiKey, verificationRoute);
  app.use("/api/music", authenticateApiKey, musicRoute);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

let _serverInstance = null;

export function startApiServer(discordClient) {
  if (_serverInstance) {
    console.log("[INFO] API server already running, skipping duplicate start");
    return _serverInstance;
  }

  if (!config.api.key) {
    console.warn(
      "[WARN] BOT_API_KEY is not set — every API request will be rejected. Set it to enable the API.",
    );
  }

  const app = createApiServer(discordClient);
  const port = config.api.port;

  const server = app.listen(port, () => {
    console.log(`[SUCCESS] API server listening on port ${port}`);
    console.log(`[INFO] Health check: http://localhost:${port}/health`);
    console.log(`[INFO] API base URL: http://localhost:${port}/api`);
  });

  attachWsServer(server, discordClient);

  const { getRelayWss } = attachZyraRelay();

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/relay/zyra") {
      getRelayWss().handleUpgrade(req, socket, head, (ws) => {
        getRelayWss().emit("connection", ws, req);
      });
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[ERROR] Port ${port} is already in use. Is another instance running?`,
      );
      process.exit(1);
    } else {
      throw err;
    }
  });

  _serverInstance = server;

  const shutdown = (signal) => {
    console.log(`[INFO] ${signal} received: closing API server`);
    server.close(() => {
      console.log("[INFO] API server closed");
      _serverInstance = null;
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}
