import { timingSafeEqual } from "node:crypto";
import config from "../../../config.js";

/**
 * Constant-time string comparison, to avoid leaking the key via response timing.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Middleware to authenticate API requests using a Bearer token.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {void|import('express').Response} A 401 response if authentication fails, otherwise calls next().
 */
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

  const token = authHeader.replace("Bearer ", "");

  // Reject all requests when no key is configured (fail closed), and compare in
  // constant time otherwise.
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
