import { Router } from "express";
import { updateStatusMessage } from "../../utils/statusUpdater.js";



const router = Router();

/**
 * POST /api/admin/refresh
 * Refreshes the status message.
 */
router.post("/refresh", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    await updateStatusMessage(client);
    res.json({ success: true, data: { message: "Status message refreshed." } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
