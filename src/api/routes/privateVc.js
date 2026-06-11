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
  getVCByCreator,
  listAllVCs,
  forceDeleteVC,
  isVCCreator,
  isOwner,
  canManageVC,
  hasVCAccess,
} from "../../utils/privateVCManager.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    res.json({
      success: true,
      data: { count: activeCount(), vcs: listAllVCs(guild) },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/create", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    const { userId, memberIds = [] } = req.body;
    if (!userId)
      return res.status(400).json({ success: false, error: "userId required" });

    const requester = await guild.members.fetch(userId).catch(() => null);
    if (!requester)
      return res
        .status(404)
        .json({ success: false, error: "Requester not found." });

    if (!hasVCAccess(requester))
      return res.status(403).json({
        success: false,
        error: "You need the Member role to use private voice channels.",
      });

    if (!canCreate()) {
      return res.status(409).json({
        success: false,
        error: `Maximum of ${config.privateVC.maxSimultaneous} private VCs already active.`,
      });
    }

    if (getVCByMember(userId) || getVCByCreator(userId)) {
      return res
        .status(409)
        .json({ success: false, error: "User is already in a private VC." });
    }

    const inviteIds = [...new Set(memberIds)].filter((id) => id !== userId);
    const invitedMembers = (
      await Promise.all(
        inviteIds.map((id) => guild.members.fetch(id).catch(() => null)),
      )
    )
      .filter(Boolean)
      .filter((m) => !m.user.bot);
    const members = [requester, ...invitedMembers];

    const channel = await createPrivateVC(guild, members);
    if (!channel)
      return res
        .status(500)
        .json({ success: false, error: "Failed to create VC." });

    res.json({
      success: true,
      data: { channelId: channel.id, name: channel.name },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/add", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    const { requesterId, targetUserId } = req.body;
    if (!requesterId || !targetUserId)
      return res.status(400).json({
        success: false,
        error: "requesterId and targetUserId required",
      });

    const requester = await guild.members.fetch(requesterId).catch(() => null);
    if (!requester)
      return res
        .status(404)
        .json({ success: false, error: "Requester not found." });

    const channelId = getVCByCreator(requesterId);
    if (!channelId)
      return res
        .status(404)
        .json({ success: false, error: "Requester has not created a private VC." });

    const data = getVCData(channelId);
    if (!data || !isVCCreator(channelId, requester))
      return res.status(403).json({
        success: false,
        error: "You can only add members to a VC you created.",
      });
    if (data.members.has(targetUserId))
      return res
        .status(409)
        .json({ success: false, error: "User is already in this VC." });
    if (getVCByMember(targetUserId))
      return res.status(409).json({
        success: false,
        error: "User is already in another private VC.",
      });

    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member)
      return res
        .status(404)
        .json({ success: false, error: "Member not found." });

    await addMember(channelId, member, guild);
    res.json({ success: true, data: { channelId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/private-vc/remove
 * Removes a member from a private voice channel.
 * Expects { requesterId, targetUserId, channelId? } in the request body.
 */
router.post("/remove", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    const {
      requesterId,
      targetUserId,
      channelId: requestedChannelId,
    } = req.body;
    if (!requesterId || !targetUserId)
      return res.status(400).json({
        success: false,
        error: "requesterId and targetUserId required",
      });

    const requester = await guild.members.fetch(requesterId).catch(() => null);
    if (!requester)
      return res
        .status(404)
        .json({ success: false, error: "Requester not found." });

    const channelId = requestedChannelId || getVCByCreator(requesterId);
    if (!channelId)
      return res.status(404).json({
        success: false,
        error: "Requester has not created a private VC.",
      });

    const data = getVCData(channelId);
    if (!data || !canManageVC(channelId, requester))
      return res.status(403).json({
        success: false,
        error: "Only the VC creator or owner can remove members from this VC.",
      });
    if (!data.members.has(targetUserId))
      return res
        .status(404)
        .json({ success: false, error: "User is not in this VC." });
    if (requesterId === targetUserId && !isOwner(requester))
      return res
        .status(400)
        .json({ success: false, error: "Cannot remove yourself." });

    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member)
      return res
        .status(404)
        .json({ success: false, error: "Member not found." });

    await removeMember(channelId, member, guild);
    res.json({ success: true, data: { channelId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/private-vc/:channelId
 * Force deletes a private voice channel (owner-role only).
 * Expects { requesterId } in the request body.
 */
router.delete("/:channelId", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    const { channelId } = req.params;
    const { requesterId } = req.body;
    if (!requesterId)
      return res
        .status(400)
        .json({ success: false, error: "requesterId required" });

    const requester = await guild.members.fetch(requesterId).catch(() => null);
    if (!requester)
      return res
        .status(404)
        .json({ success: false, error: "Requester not found." });
    if (!getVCData(channelId)) {
      return res
        .status(404)
        .json({ success: false, error: "Private VC not found." });
    }
    if (!canManageVC(channelId, requester)) {
      return res.status(403).json({
        success: false,
        error: "Only the VC creator or owner can delete this private VC.",
      });
    }

    await forceDeleteVC(channelId, guild);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
