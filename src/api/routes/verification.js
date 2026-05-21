import { Router } from "express";
import {
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import config from "../../../config.js";
import { EMBED_COLOR, eSend, addFooter } from "../../utils/embed.js";
import { i, icon } from "../../utils/icons.js";
import {
  getAllPendingRequests,
  getRequest,
  hasPendingRequest,
  createRequest,
  removeRequest,
  logApproval,
} from "../../utils/verificationHandler.js";
import { broadcastWs } from "../wsServer.js";
import { checkModerationPermission } from "../../utils/moderation.js";

const router = Router();



async function broadcastVerification(guild) {
  const pending = await getAllPendingRequests();
  const list = Object.values(pending).map((r) => {
    const member = guild?.members.cache.get(r.userId);
    return {
      ...r,
      displayName: member?.displayName ?? r.username,
      avatar: member?.user.displayAvatarURL({ size: 64 }) ?? null,
    };
  });
  broadcastWs({ type: "verification_update", data: list });
}

router.get("/pending", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    await guild.members.fetch({ limit: 200 }).catch(() => {});
    const pending = await getAllPendingRequests();
    const list = Object.values(pending).map((r) => {
      const member = guild.members.cache.get(r.userId);
      return {
        ...r,
        displayName: member?.displayName ?? r.username,
        avatar: member?.user.displayAvatarURL({ size: 64 }) ?? null,
      };
    });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/user-status", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    const { userId } = req.query;
    if (!userId)
      return res.status(400).json({ success: false, error: "userId required" });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member)
      return res
        .status(404)
        .json({ success: false, error: "Member not found" });

    const roleIds = [...member.roles.cache.keys()];
    const hasFriends = member.roles.cache.has(config.friendsRoleId);
    const hasMember = member.roles.cache.has(config.memberRoleId);
    const pending = await getRequest(userId);

    res.json({
      success: true,
      data: {
        roleIds,
        hasFriends,
        hasMember,
        hasPending: !!pending,
        pendingRole: pending?.requestedRole ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/apply", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    const { userId, type } = req.body;
    if (!userId || !type)
      return res
        .status(400)
        .json({ success: false, error: "userId and type required" });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member)
      return res
        .status(404)
        .json({ success: false, error: "Member not found" });

    if (await hasPendingRequest(userId)) {
      return res
        .status(409)
        .json({ success: false, error: "You already have a pending request." });
    }

    const isFriends = type === "friends";
    const requestedRole = isFriends ? "Friends" : "Member";
    const requestedRoleId = isFriends
      ? config.friendsRoleId
      : config.memberRoleId;

    if (isFriends && member.roles.cache.has(config.friendsRoleId)) {
      return res
        .status(409)
        .json({ success: false, error: "You already have the Friends role." });
    }
    if (!isFriends && member.roles.cache.has(config.memberRoleId)) {
      return res
        .status(409)
        .json({ success: false, error: "You already have the Member role." });
    }
    if (!isFriends && !member.roles.cache.has(config.friendsRoleId)) {
      return res.status(400).json({
        success: false,
        error: "You must have the Friends role before applying for Member.",
      });
    }

    const iconStr = isFriends ? icon("FRIENDS_ROLE") : icon("MEMBER_ROLE");
    const approvalContainer = new ContainerBuilder()
      .setAccentColor(EMBED_COLOR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${iconStr} ɴᴇᴡ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ\n<@${userId}> ʜᴀs ʀᴇǫᴜᴇsᴛᴇᴅ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ғᴏʀ **${requestedRole}** ʀᴏʟᴇ ᴠɪᴀ ᴡᴇʙ ᴅᴀsʜʙᴏᴀʀᴅ.`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**ᴜsᴇʀ:** <@${userId}>\n**ᴜsᴇʀɴᴀᴍᴇ:** ${member.user.tag}\n**ʀᴇǫᴜᴇsᴛᴇᴅ ʀᴏʟᴇ:** ${requestedRole}`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# User ID: ${userId}`)
      );

    addFooter(approvalContainer);

    const approvalsChannel = await guild.channels
      .fetch(config.approvalsChannelId)
      .catch(() => null);
    if (!approvalsChannel)
      return res
        .status(500)
        .json({ success: false, error: "Approvals channel not found." });

    await approvalsChannel.send({
      content: `<@&${config.ownerRoleId}> <@&${config.managerRoleId}> <@&${config.moderatorRoleId}>`,
    }).catch(() => null);
    const approvalMessage = await approvalsChannel.send({
      components: [approvalContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    await createRequest(
      userId,
      member.user.tag,
      requestedRole,
      requestedRoleId,
      approvalMessage.id,
    );
    await broadcastVerification(guild);

    res.json({
      success: true,
      data: { message: "Verification request submitted." },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/approve", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    const { requesterId, targetUserId, nickname } = req.body;
    if (!requesterId || !targetUserId || !nickname) {
      return res.status(400).json({
        success: false,
        error: "requesterId, targetUserId, and nickname required",
      });
    }

    const requester = await guild.members.fetch(requesterId).catch(() => null);
    if (!requester)
      return res
        .status(404)
        .json({ success: false, error: "Requester not found." });
    if (!(await checkModerationPermission(guild, requesterId, "mod")))
      return res
        .status(403)
        .json({ success: false, error: "Moderator+ required." });

    const request = await getRequest(targetUserId);
    if (!request)
      return res
        .status(404)
        .json({ success: false, error: "Pending request not found." });

    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member) {
      await removeRequest(targetUserId);
      return res
        .status(404)
        .json({ success: false, error: "Member no longer in server." });
    }

    const isFriends = request.requestedRoleId === config.friendsRoleId;
    const finalNickname = isFriends ? nickname : `God ${nickname}`;

    if (member.roles.cache.has(config.unverifiedRoleId)) {
      await member.roles.remove(config.unverifiedRoleId);
    }
    await member.roles.add(request.requestedRoleId);
    await member.setNickname(finalNickname).catch(() => {});

    if (request.approvalMessageId) {
      const approvalsChannel = await guild.channels
        .fetch(config.approvalsChannelId)
        .catch(() => null);
      if (approvalsChannel) {
        const msg = await approvalsChannel.messages
          .fetch(request.approvalMessageId)
          .catch(() => null);
        if (msg) {
          const updatedContainer = new ContainerBuilder()
            .setAccentColor(EMBED_COLOR)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## ${icon("SUCCESS")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ\n<@${targetUserId}> (${request.username}) - **${request.requestedRole}**`
              )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**ᴀᴘᴘʀᴏᴠᴇᴅ ʙʏ:** <@${requesterId}>\n**ɴɪᴄᴋɴᴀᴍᴇ:** ${finalNickname}`
              )
            );
          addFooter(updatedContainer);
          await msg
            .edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 })
            .catch(() => {});
        }
      }
    }

    await logApproval(
      targetUserId,
      request.username,
      request.requestedRole,
      requester.user.tag,
      requesterId,
      finalNickname,
      "approved",
    );
    await removeRequest(targetUserId);

    const user = await client.users.fetch(targetUserId).catch(() => null);
    if (user) {
      const approvalContainer = new ContainerBuilder()
        .setAccentColor(EMBED_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${i("DONE")} sᴀɪʏᴀɴ ɢᴏᴅs — ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ\nʏᴏᴜʀ ʀᴇǫᴜᴇsᴛ ʜᴀs ʙᴇᴇɴ ᴀᴘᴘʀᴏᴠᴇᴅ!\n\n**ʀᴏʟᴇ:** ${request.requestedRole}\n**ɴɪᴄᴋɴᴀᴍᴇ:** ${finalNickname}`,
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small),
        );

      await user
        .send({
          components: [approvalContainer],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    }

    await broadcastVerification(guild);
    res.json({ success: true, data: { finalNickname } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/verification/reject — { requesterId, targetUserId }
router.post("/reject", async (req, res) => {
  try {
    const client = req.app.get("discordClient");
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild)
      return res.status(503).json({ success: false, error: "Guild not found" });

    const { requesterId, targetUserId } = req.body;
    if (!requesterId || !targetUserId) {
      return res.status(400).json({
        success: false,
        error: "requesterId and targetUserId required",
      });
    }

    const requester = await guild.members.fetch(requesterId).catch(() => null);
    if (!requester)
      return res
        .status(404)
        .json({ success: false, error: "Requester not found." });
    if (!(await checkModerationPermission(guild, requesterId, "mod")))
      return res
        .status(403)
        .json({ success: false, error: "Moderator+ required." });

    const request = await getRequest(targetUserId);
    if (!request)
      return res
        .status(404)
        .json({ success: false, error: "Pending request not found." });

    if (request.approvalMessageId) {
      const approvalsChannel = await guild.channels
        .fetch(config.approvalsChannelId)
        .catch(() => null);
      if (approvalsChannel) {
        const msg = await approvalsChannel.messages
          .fetch(request.approvalMessageId)
          .catch(() => null);
        if (msg) {
          const updatedContainer = new ContainerBuilder()
            .setAccentColor(EMBED_COLOR)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## ${icon("ERROR")} ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇᴊᴇᴄᴛᴇᴅ\n<@${targetUserId}> (${request.username}) - **${request.requestedRole}**`
              )
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**ʀᴇᴊᴇᴄᴛᴇᴅ ʙʏ:** <@${requesterId}>`
              )
            );
          addFooter(updatedContainer);
          await msg
            .edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 })
            .catch(() => {});
        }
      }
    }

    await logApproval(
      targetUserId,
      request.username,
      request.requestedRole,
      requester.user.tag,
      requesterId,
      null,
      "rejected",
    );
    await removeRequest(targetUserId);

    const user = await client.users.fetch(targetUserId).catch(() => null);
    if (user) {
      const rejectContainer = new ContainerBuilder()
        .setAccentColor(EMBED_COLOR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${i("ERROR")} sᴀɪʏᴀɴ ɢᴏᴅs — ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ғᴀɪʟᴇᴅ\nsᴏʀʀʏ, ʏᴏᴜʀ ʀᴇǫᴜᴇsᴛ ғᴏʀ **${request.requestedRole}** ʀᴏʟᴇ ʜᴀs ʙᴇᴇɴ ʀᴇᴊᴇᴄᴛᴇᴅ.`,
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small),
        );

      addFooter(rejectContainer);

      await user
        .send({
          components: [rejectContainer],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch(() => {});
    }

    await broadcastVerification(guild);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
