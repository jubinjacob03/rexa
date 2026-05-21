import { Router } from "express";
import { issueToken } from "../wsTokens.js";

const router = Router();

/**
 * GET /api/ws-token
 * Issues a new short-lived token for WebSocket authentication.
 */
router.get("/", (req, res) => {
  const token = issueToken();
  res.json({
    success: true,
    data: { token, expiresInMs: 30_000 },
  });
});

export default router;
