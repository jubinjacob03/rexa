import { Router } from "express";
import config from "../../../config.js";
import {
  activeCount,
  canCreate,
  createPrivateVC,
  addMember,
  removeMember,
  getVCData,
  getVCByMember,
  listAllVCs,
} from "../../utils/privateVCManager.js";

const router = Router();

// GET /api/private-vc — list active VCs
router.get("/", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return res.status(503).json({ success: false, error: "Guild not found" });

    res.json({ success: true, data: { count: activeCount(), vcs: listAllVCs(guild) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/private-vc/create — { userId, memberIds: string[] }
router.post("/create", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return res.status(503).json({ success: false, error: "Guild not found" });

    const { userId, memberIds = [] } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: "userId required" });

    if (!canCreate()) {
      return res.status(409).json({ success: false, error: `Maximum of ${config.privateVC.maxSimultaneous} private VCs already active.` });
    }

    if (getVCByMember(userId)) {
      return res.status(409).json({ success: false, error: "User is already in a private VC." });
    }

    const allIds = [...new Set([userId, ...memberIds])];
    const members = (
      await Promise.all(allIds.map((id) => guild.members.fetch(id).catch(() => null)))
    ).filter(Boolean).filter((m) => !m.user.bot);

    const channel = await createPrivateVC(guild, members);
    if (!channel) return res.status(500).json({ success: false, error: "Failed to create VC." });

    res.json({ success: true, data: { channelId: channel.id, name: channel.name } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/private-vc/add — { requesterId, targetUserId }
router.post("/add", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return res.status(503).json({ success: false, error: "Guild not found" });

    const { requesterId, targetUserId } = req.body;
    if (!requesterId || !targetUserId) return res.status(400).json({ success: false, error: "requesterId and targetUserId required" });

    const channelId = getVCByMember(requesterId);
    if (!channelId) return res.status(404).json({ success: false, error: "Requester is not in a private VC." });

    const data = getVCData(channelId);
    if (data?.members.has(targetUserId)) return res.status(409).json({ success: false, error: "User is already in this VC." });
    if (getVCByMember(targetUserId)) return res.status(409).json({ success: false, error: "User is already in another private VC." });

    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member) return res.status(404).json({ success: false, error: "Member not found." });

    await addMember(channelId, member, guild);
    res.json({ success: true, data: { channelId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/private-vc/remove — { requesterId, targetUserId }
router.post("/remove", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return res.status(503).json({ success: false, error: "Guild not found" });

    const { requesterId, targetUserId } = req.body;
    if (!requesterId || !targetUserId) return res.status(400).json({ success: false, error: "requesterId and targetUserId required" });

    const channelId = getVCByMember(requesterId);
    if (!channelId) return res.status(404).json({ success: false, error: "Requester is not in a private VC." });

    const data = getVCData(channelId);
    if (!data?.members.has(targetUserId)) return res.status(404).json({ success: false, error: "User is not in this VC." });
    if (requesterId === targetUserId) return res.status(400).json({ success: false, error: "Cannot remove yourself." });

    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member) return res.status(404).json({ success: false, error: "Member not found." });

    await removeMember(channelId, member, guild);
    res.json({ success: true, data: { channelId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

const router = Router();

// GET /api/private-vc — list active private VCs
router.get("/", (req, res) => {
  const client = req.app.get("discordClient");
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return res.status(503).json({ success: false, error: "Guild not found" });

  const list = [];
  for (const [channelId, data] of (/** @type {Map<string,any>} */ (
    // Access module-level state via exported helpers
    Object.entries({})
  ))) {
    // Handled via getVCData — we expose a listAll instead
  }

  // Use the exported helper we'll add
  const { listAllVCs } = require("../../utils/privateVCManager.js");
  res.json({ success: true, data: { count: activeCount() } });
});

export default router;
