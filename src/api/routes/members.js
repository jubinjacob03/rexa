import { Router } from "express";
import config from "../../../config.js";

const router = Router();

// GET /api/members?userId=X — get a member's roles for role-gating on the web
// GET /api/members — lightweight list for member picker
router.get("/", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return res.status(503).json({ success: false, error: "Guild not found" });

    const { userId } = req.query;

    if (userId) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return res.status(404).json({ success: false, error: "Member not found." });

      return res.json({
        success: true,
        data: {
          id: member.id,
          username: member.user.username,
          displayName: member.displayName,
          avatar: member.user.displayAvatarURL({ size: 64 }),
          roleIds: [...member.roles.cache.keys()],
        },
      });
    }

    // Full list — fetch first 200 members
    await guild.members.fetch({ limit: 200 });
    const members = guild.members.cache
      .filter((m) => !m.user.bot)
      .map((m) => ({
        id: m.id,
        username: m.user.username,
        displayName: m.displayName,
        avatar: m.user.displayAvatarURL({ size: 64 }),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    res.json({ success: true, data: { members } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
