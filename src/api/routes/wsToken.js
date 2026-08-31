import { Router } from "express";
import { issueToken } from "../wsTokens.js";

const router = Router();

router.get("/", (req, res) => {
  const token = issueToken();
  res.json({
    success: true,
    data: { token, expiresInMs: 30_000 },
  });
});

export default router;
