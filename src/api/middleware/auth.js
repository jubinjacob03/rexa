import config from "../../../config.js";

/**
 * Middleware to authenticate API requests using a Bearer token.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {void|import('express').Response} Returns a 401 response if authentication fails, otherwise calls next().
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
