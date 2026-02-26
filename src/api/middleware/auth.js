import config from "../../../config.js";

/**
 * Middleware to authenticate API requests using Bearer token
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

  if (token !== config.api.key) {
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
