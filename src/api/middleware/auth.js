import { timingSafeEqual } from "node:crypto";
import config from "../../../config.js";

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function authenticateApiKey(req, res, next) {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: {
        code: "MISSING_AUTH",
        message: "Authorization header is required",
      },
      timestamp: new Date().toISOString(),
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!config.api.key || !safeEqual(token, config.api.key)) {
    return res.status(401).json({
      success: false,
      error: {
        code: "INVALID_AUTH",
        message: "Invalid API key",
      },
      timestamp: new Date().toISOString(),
    });
  }

  next();
}
