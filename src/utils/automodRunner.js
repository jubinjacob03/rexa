import { generateObject } from "ai";
import { z } from "zod";
import config, { getLanguageModel } from "../agents/config.js";
import * as modTools from "./moderation.js";
import { loadConfig } from "./automodManager.js";

// In-memory rate trackers
const userTrackers = new Map();
// Stores who has been warned already (Key: userId, Value: timestamp)
const UserWarnings = new Map();

const TRACKER_TTL = 10000; // 10 seconds tracking window
const WARNING_COOLDOWN = 20 * 60 * 1000; // 20 minutes in milliseconds

function getTracker(userId) {
  if (!userTrackers.has(userId)) {
    userTrackers.set(userId, {
      messageCount: 0,
      channelDeleteCount: 0,
      nicknameChangeCount: 0,
      messageDeleteCount: 0,
      lastCheck: Date.now(),
      recentMessages: [],
      recentMessageIds: [],
    });
  }
  return userTrackers.get(userId);
}

function cleanupTrackers() {
  const now = Date.now();
  for (const [userId, tracker] of userTrackers.entries()) {
    if (now - tracker.lastCheck > TRACKER_TTL) {
      userTrackers.delete(userId);
    }
  }

  for (const [userId, warnTime] of UserWarnings.entries()) {
    if (now - warnTime > WARNING_COOLDOWN) {
      UserWarnings.delete(userId);
    }
  }
}
setInterval(cleanupTrackers, 10000);

export async function checkSpam(message) {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.spam) return;

  const tracker = getTracker(message.author.id);
  tracker.messageCount++;
  tracker.recentMessages.push(message.content);
  tracker.recentMessageIds.push({ id: message.id, channel: message.channel });
  tracker.lastCheck = Date.now();

  const msgSpamLimit = cfg.limits?.messageSpam || 5;

  if (tracker.messageCount > msgSpamLimit) {
    // Attempt immediate bulk deletion of spam
    try {
      for (const msgData of tracker.recentMessageIds) {
        await msgData.channel.messages.delete(msgData.id).catch(() => {});
      }
    } catch (err) {
      console.error("[AutoMod] Failed to delete spam msgs", err);
    }

    await triggerWarningOrAction(
      message.guild,
      message.author.id,
      message,
      "You are sending too many messages too quickly!",
      async () => {
        // Anomaly detected - defer to AI for punishment length or default to timeout
        await triggerAIModeration(
          message.guild,
          message.author.id,
          "Spam Filter Anomaly",
          `User sent ${tracker.messageCount} messages in a few seconds. Messages: ${JSON.stringify(tracker.recentMessages)}`,
        );
      },
    );
    userTrackers.delete(message.author.id); // Reset after trigger
  }
}

// ── Deterministic Anti-Nuke Measures (Instant Execution) ──────────────
// No AI overhead. This directly prevents rogue mods from destroying the server.

async function triggerWarningOrAction(
  guild,
  userId,
  message,
  warningText,
  actionCallback,
) {
  const hasBeenWarned = UserWarnings.has(userId);

  if (hasBeenWarned) {
    // Escalate to action because they violated it twice in 20 minutes
    await actionCallback();
  } else {
    // First offense: Send Ephemeral warning (or DM if not a message context)
    UserWarnings.set(userId, Date.now());

    // Attempt warning
    try {
      if (message) {
        const warningMsg = await message.channel.send({
          content: `<@${userId}> ⚠️ **WARNING**: ${warningText} Repeating this within 20 minutes will result in severe server punishment.`,
        });
        // Auto-delete warning after 10s to avoid clutter
        setTimeout(() => warningMsg.delete().catch(() => {}), 10000);
      } else {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member)
          await member.send({
            content: `⚠️ **SERVER WARNING**: ${warningText} Repeating this within 20 minutes will result in severe punishment.`,
          });
      }
    } catch (err) {
      console.error("[AutoMod] Failed sending warning", err);
    }
  }
}

async function instantAntiNuke(guild, userId, reason, actionType = "ban") {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    if (member.id === guild.ownerId || member.user.bot) return;

    console.log(
      `[ANTI-NUKE] EXECUTING INSTANT LOCKDOWN (${actionType}) ON ${member.user.tag}: ${reason}`,
    );

    if (actionType.startsWith("ban")) {
      await modTools.ban(
        member,
        actionType === "ban-wipe" ? 1 : 0,
        `[ANTI-NUKE] ${reason}`,
      );
    } else if (actionType === "timeout") {
      await modTools.timeout(member, 60, `[ANTI-NUKE] ${reason}`); // 1 hour timeout
    }
  } catch (err) {
    console.error(`[ANTI-NUKE] Failed to execute lockdown:`, err.message);
  }
}

export async function checkChannelDelete(channel, executor) {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.raid) return;
  if (!executor) return;

  const tracker = getTracker(executor.id);
  tracker.channelDeleteCount++;
  tracker.lastCheck = Date.now();

  const channelDeleteLimit = cfg.limits?.channelDelete || 2;

  if (tracker.channelDeleteCount >= channelDeleteLimit) {
    await triggerWarningOrAction(
      channel.guild,
      executor.id,
      null,
      "You are deleting channels too rapidly! Stop immediately.",
      async () => {
        await instantAntiNuke(
          channel.guild,
          executor.id,
          `Rapid Channel Deletion detected.`,
          "ban",
        );
      },
    );
    userTrackers.delete(executor.id);
  }
}

export async function checkMemberUpdate(oldMember, newMember) {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.raid) return;

  if (oldMember.nickname !== newMember.nickname) {
    const tracker = getTracker(newMember.id);
    tracker.nicknameChangeCount++;
    tracker.lastCheck = Date.now();

    const nickLimit = cfg.limits?.nicknameChange || 3;

    if (tracker.nicknameChangeCount >= nickLimit) {
      await triggerWarningOrAction(
        newMember.guild,
        newMember.id,
        null,
        "You are changing your nickname too rapidly. Please stop.",
        async () => {
          await instantAntiNuke(
            newMember.guild,
            newMember.id,
            `Rapid Nickname Changes detected.`,
            "timeout", // Punish with timeout instead of Ban for this
          );
        },
      );
      userTrackers.delete(newMember.id);
    }
  }
}

export async function checkMessageDelete(message, executor) {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.raid) return;
  if (!executor) return;

  const tracker = getTracker(executor.id);
  tracker.messageDeleteCount++;
  tracker.lastCheck = Date.now();

  const msgDelLimit = cfg.limits?.messageDelete || 3;

  if (tracker.messageDeleteCount >= msgDelLimit) {
    await triggerWarningOrAction(
      message.guild,
      executor.id,
      message, // pass message to reply in channel
      "You are rapid-deleting messages! Stop immediately.",
      async () => {
        await instantAntiNuke(
          message.guild,
          executor.id,
          `Rapid Message Deletion (Wipe) detected.`,
          "ban",
        );
      },
    );
    userTrackers.delete(executor.id);
  }
}

export async function checkToxicity(message) {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.toxicity) return;

  // Basic heuristic check before invoking expensive AI for every message
  const toxicKeywords = [
    "bitch",
    "nigger",
    "faggot",
    "kys",
    "whore",
    "slut",
    "kill yourself",
    "retard",
    "rape",
  ];

  const content = message.content.toLowerCase();
  const hasToxic = toxicKeywords.some((kw) => content.includes(kw));

  if (hasToxic) {
    await triggerWarningOrAction(
      message.guild,
      message.author.id,
      message,
      "Your message contained highly toxic phrasing. Please refrain from using such language.",
      async () => {
        await triggerAIModeration(
          message.guild,
          message.author.id,
          "Toxicity Filter Anomaly",
          `User sent potentially highly toxic message: "${message.content}"`,
        );
      },
    );
  }
}

// Ensure we don't trigger multiple LLM calls for the same user concurrently
const activeModerationLocks = new Set();

async function triggerAIModeration(guild, userId, anomalyType, contextData) {
  if (activeModerationLocks.has(userId)) return;
  activeModerationLocks.add(userId);

  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    // Ignore owner/bots
    if (member.id === guild.ownerId || member.user.bot) return;

    console.log(
      `[AutoMod] Triggering AI Decision for ${member.user.tag}: ${anomalyType}`,
    );

    const prompt = `
      You are the autonomous AutoMod AI for the Discord server "${guild.name}".
      ANOMALY DETECTED:
      - Type: ${anomalyType}
      - Target User: ${member.displayName}
      - Context: ${contextData}

      Based on this extremely suspicious behavior, decide the appropriate moderation action.
      A fast spammer might just need a timeout. A malicious raider deleting channels should be banned.
      Take a measured but strict approach to protect the server.

      Respond ONLY with the JSON object. 
      For action use: 'timeout', 'kick', 'ban', 'ban-wipe' (bans and deletes 1 day of messages; use if it's a pure spam raid), or 'none'.
    `;

    const modelObj = getLanguageModel(config.model.provider, config.model.name);

    const result = await generateObject({
      model: modelObj,
      prompt,
      schema: z.object({
        action: z.enum(["timeout", "kick", "ban", "ban-wipe", "none"]),
        durationMinutes: z.number().optional().describe("For timeout only"),
        reason: z.string().describe("Audit log reason for taking this action"),
      }),
    });

    const { action, durationMinutes, reason } = result.object;
    console.log(
      `[AutoMod AI Decision] Computed Action for ${member.user.tag}: ${action} (Reason: ${reason})`,
    );

    const finalReason = `[AutoMod] ${reason}`;

    try {
      switch (action) {
        case "timeout":
          await modTools.timeout(member, durationMinutes || 10, finalReason);
          break;
        case "kick":
          await modTools.kick(member, finalReason);
          break;
        case "ban":
          await modTools.ban(member, 0, finalReason);
          break;
        case "ban-wipe":
          await modTools.ban(member, 1, finalReason);
          break;
      }
    } catch (execErr) {
      console.error(`[AutoMod Execution Error] Task failed:`, execErr.message);
    }
  } catch (error) {
    console.error("[AutoMod Request Error]", error);
  } finally {
    activeModerationLocks.delete(userId);
  }
}
