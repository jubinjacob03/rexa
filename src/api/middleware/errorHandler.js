/**
 * Global error handler middleware
 */
export function errorHandler(err, req, res, next) {
  console.error("[API ERROR]", err);

  // Handle specific error types
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err.message,
      },
      timestamp: new Date().toISOString(),
    });
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication failed",
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Default 500 error
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "An internal error occurred"
          : err.message,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
    timestamp: new Date().toISOString(),
  });
}
