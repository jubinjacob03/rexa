import { generateObject } from "ai";
import { z } from "zod";
import config, { getLanguageModel } from "../agents/config.js";
import rootConfig from "../../config.js";
import * as modTools from "./moderation.js";
import { loadConfig, getConfigSync } from "./automodManager.js";
import { EMBED_COLOR, addFooter } from "./embed.js";
import { i, icon } from "./icons.js";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { ignoredDeletes } from "../events/messageDelete.js";
async function sendActionEmbed(
  channel,
  userId,
  action,
  reason,
  durationMinutes,
) {
  if (!channel) return;
  const actionLabels = {
    timeout: `${i("TIMER")} ᴛɪᴍᴇᴅ ᴏᴜᴛ`,
    kick: `${i("WARNING")} ᴋɪᴄᴋᴇᴅ`,
    ban: `${i("LOCK")} ʙᴀɴɴᴇᴅ`,
    "ban-wipe": `${i("PURGE")} ʙᴀɴɴᴇᴅ & ᴡɪᴘᴇᴅ`,
  };
  const label = actionLabels[action] || action;
  const desc = durationMinutes
    ? `<@${userId}> ʜᴀs ʙᴇᴇɴ **${action}** ғᴏʀ **${durationMinutes}ᴍ**.\n\n\`\`\`ansi\n\u001b[1;37m${icon("EDITOR")} ʀᴇᴀsᴏɴ\u001b[0m\n\n\u001b[0m${reason}\u001b[0m\`\`\``
    : `<@${userId}> ʜᴀs ʙᴇᴇɴ **${action}**.\n\n\`\`\`ansi\n\u001b[1;37m${icon("EDITOR")} ʀᴇᴀsᴏɴ\u001b[0m\n\n\u001b[0m${reason}\u001b[0m\`\`\``;

  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-*ᴀᴜᴛᴏᴍᴏᴅ ᴀᴄᴛɪᴏɴ*-\n## ${label}\n${desc}`,
    ),
  );

  container.addSectionComponents(section);
  addFooter(container);

  await channel
    .send({ components: [container], flags: MessageFlags.IsComponentsV2 })
    .catch(() => {});
}

const userTrackers = new Map();
const UserWarnings = new Map();

const TRACKER_TTL = 10000;
const SPAM_WINDOW_MS = 7000;
const WARNING_COOLDOWN = 20 * 60 * 1000;
function getTracker(userId) {
  if (!userTrackers.has(userId)) {
    userTrackers.set(userId, {
      channelDeleteCount: 0,
      channelCreateCount: 0,
      channelUpdateCount: 0,
      nicknameChangeCount: 0,
      messageDeleteCount: 0,
      banCount: 0,
      kickCount: 0,
      roleDeleteCount: 0,
      roleCreateCount: 0,
      banRemoveCount: 0,
      webhookCreateCount: 0,
      lastCheck: Date.now(),
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
setInterval(cleanupTrackers, 10000).unref();

export async function checkSpam(message) {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.spam) return;

  const now = Date.now();
  const tracker = getTracker(message.author.id);
  tracker.recentMessageIds.push({
    id: message.id,
    channel: message.channel,
    content: message.content,
    ts: now,
  });
  tracker.lastCheck = now;

  const cutoff = now - SPAM_WINDOW_MS;
  tracker.recentMessageIds = tracker.recentMessageIds.filter(
    (m) => m.ts >= cutoff,
  );

  const msgSpamLimit = cfg.limits?.messageSpam || 5;

  if (tracker.recentMessageIds.length > msgSpamLimit) {
    const burst = tracker.recentMessageIds;
    const burstContents = burst.map((m) => m.content);
    const burstCount = burst.length;
    try {
      for (const msgData of burst) {
        ignoredDeletes.add(msgData.id);
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
        await triggerAIModeration(
          message.guild,
          message.author.id,
          "Spam Filter Anomaly",
          `User sent ${burstCount} messages within ${SPAM_WINDOW_MS / 1000}s. Messages: ${JSON.stringify(burstContents)}`,
          message.channel,
        );
      },
    );
    userTrackers.delete(message.author.id);
  }
}

async function triggerWarningOrAction(
  guild,
  userId,
  message,
  warningText,
  actionCallback,
) {
  const hasBeenWarned = UserWarnings.has(userId);

  if (hasBeenWarned) {
    await actionCallback();
  } else {
    UserWarnings.set(userId, Date.now());

    const member = await guild.members.fetch(userId).catch(() => null);
    const channel = message?.channel ?? null;

    if (member && member.id !== guild.ownerId && !member.user.bot) {
      await modTools
        .timeout(member, 10, `[AutoMod] ${warningText}`)
        .catch(() => {});
      await sendActionEmbed(channel, userId, "timeout", warningText, 10);
    }

    try {
      const warningContainer = new ContainerBuilder().setAccentColor(
        EMBED_COLOR,
      );
      const warningSection = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-*ᴀᴜᴛᴏᴍᴏᴅ ᴀʟᴇʀᴛ*-\n## ${i("WARNING")} ᴡᴀʀɴɪɴɢ\n<@${userId}> ${warningText}\n\n> ᴄᴏɴᴛɪɴᴜɪɴɢ ᴛʜɪs ʙᴇʜᴀᴠɪᴏᴜʀ ᴡɪᴛʜɪɴ 20 ᴍɪɴᴜᴛᴇs ᴡɪʟʟ ʀᴇsᴜʟᴛ ɪɴ ᴀ sᴇʀᴠᴇʀ ᴀᴄᴛɪᴏɴ.`,
        ),
      );
      warningContainer.addSectionComponents(warningSection);
      addFooter(warningContainer);

      if (channel) {
        await channel.send({
          components: [warningContainer],
          flags: MessageFlags.IsComponentsV2,
        });
      } else if (member) {
        await member
          .send({
            components: [warningContainer],
            flags: MessageFlags.IsComponentsV2,
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error("[AutoMod] Failed sending warning", err);
    }
  }
}

const antiNukeLocks = new Set();

async function isWhitelisted(guild, userId) {
  if (userId === guild.ownerId) return true;
  const anti = rootConfig.antiNuke;
  if (anti.whitelistUserIds.includes(userId)) return true;

  const trustedRoles = [
    rootConfig.ownerRoleId,
    ...anti.whitelistRoleIds,
  ].filter(Boolean);
  if (!trustedRoles.length) return false;

  const member =
    guild.members.cache.get(userId) ||
    (await guild.members.fetch(userId).catch(() => null));
  if (!member) return false;
  return member.roles.cache.hasAny(...trustedRoles);
}

async function sendAntiNukeAlert(guild, content) {
  const channel = getModLogChannel(guild);
  if (!channel) return;
  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
  container.addSectionComponents(
    new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    ),
  );
  addFooter(container);
  await channel
    .send({ components: [container], flags: MessageFlags.IsComponentsV2 })
    .catch(() => {});
}

async function runNukeCheck(guild, executor, opts) {
  const {
    counterKey,
    limitKey,
    defaultLimit,
    reason,
    actionType = "ban",
  } = opts;
  if (!executor || executor.bot) return;
  if (executor.id === guild.ownerId) return;
  if (antiNukeLocks.has(executor.id)) return;

  const cfg = getConfigSync();
  if (!cfg.enabled || !cfg.raid) return;

  const channel = getModLogChannel(guild);
  const trusted = await isWhitelisted(guild, executor.id);

  if (rootConfig.antiNuke.instant && !trusted) {
    await instantAntiNuke(
      guild,
      executor.id,
      `${reason} by an untrusted account`,
      actionType,
      channel,
    );
    return;
  }

  const tracker = getTracker(executor.id);
  tracker[counterKey] = (tracker[counterKey] || 0) + 1;
  tracker.lastCheck = Date.now();
  const limit = cfg.limits?.[limitKey] || defaultLimit;
  if (tracker[counterKey] < limit) return;

  const count = tracker[counterKey];
  userTrackers.delete(executor.id);

  if (trusted) {
    await sendAntiNukeAlert(
      guild,
      `-*ᴀɴᴛɪ-ɴᴜᴋᴇ ᴀʟᴇʀᴛ*-\n## ${i("WARNING")} sᴜsᴘɪᴄɪᴏᴜs ᴀᴄᴛɪᴠɪᴛʏ\n**ʙʏ:** <@${executor.id}> (${executor.tag})\n**ᴀᴄᴛɪᴏɴ:** ${reason} ×${count} in rapid succession.\n\n> No auto-action taken — this is a trusted account. Please review immediately.`,
    );
  } else {
    await instantAntiNuke(
      guild,
      executor.id,
      `Mass ${reason} (${count} in rapid succession)`,
      actionType,
      channel,
    );
  }
}

async function instantAntiNuke(
  guild,
  userId,
  reason,
  actionType = "ban",
  channel = null,
) {
  if (antiNukeLocks.has(userId)) return;
  antiNukeLocks.add(userId);
  setTimeout(() => antiNukeLocks.delete(userId), 60_000).unref();

  try {
    const member =
      guild.members.cache.get(userId) ||
      (await guild.members.fetch(userId).catch(() => null));
    if (!member) return;
    if (member.id === guild.ownerId || member.user.bot) return;

    console.log(
      `[ANTI-NUKE] INSTANT LOCKDOWN (${actionType}) ON ${member.user.tag}: ${reason}`,
    );

    if (actionType.startsWith("ban")) {
      await modTools.ban(
        member,
        actionType === "ban-wipe" ? 1 : 0,
        `[ANTI-NUKE] ${reason}`,
      );
      sendActionEmbed(channel, member.id, actionType, reason).catch(() => {});
    } else if (actionType === "timeout") {
      await modTools.timeout(member, 60, `[ANTI-NUKE] ${reason}`);
      sendActionEmbed(channel, member.id, "timeout", reason, 60).catch(
        () => {},
      );
    }
  } catch (err) {
    console.error(`[ANTI-NUKE] Failed to execute lockdown:`, err.message);
  }
}

export async function checkChannelDelete(channel, executor) {
  await runNukeCheck(channel.guild, executor, {
    counterKey: "channelDeleteCount",
    limitKey: "channelDelete",
    defaultLimit: 2,
    reason: "Channel Deletion",
    actionType: "ban",
  });
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
            "timeout",
            newMember.guild.systemChannel,
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
  if (!executor || executor.bot) return;

  const tracker = getTracker(executor.id);
  tracker.messageDeleteCount++;
  tracker.lastCheck = Date.now();

  const msgDelLimit = cfg.limits?.messageDelete || 3;

  if (tracker.messageDeleteCount >= msgDelLimit) {
    await triggerWarningOrAction(
      message.guild,
      executor.id,
      message,
      "You are rapid-deleting messages! Stop immediately.",
      async () => {
        await instantAntiNuke(
          message.guild,
          executor.id,
          `Rapid Message Deletion (Wipe) detected.`,
          "ban",
          message.channel,
        );
      },
    );
    userTrackers.delete(executor.id);
  }
}

export async function checkMassBan(guild, executor) {
  await runNukeCheck(guild, executor, {
    counterKey: "banCount",
    limitKey: "massBan",
    defaultLimit: 3,
    reason: "Ban",
    actionType: "ban",
  });
}

export async function checkMassKick(guild, executor) {
  await runNukeCheck(guild, executor, {
    counterKey: "kickCount",
    limitKey: "massKick",
    defaultLimit: 3,
    reason: "Kick",
    actionType: "ban",
  });
}

export async function checkRoleDelete(guild, executor) {
  await runNukeCheck(guild, executor, {
    counterKey: "roleDeleteCount",
    limitKey: "roleDelete",
    defaultLimit: 2,
    reason: "Role Deletion",
    actionType: "ban",
  });
}

export async function checkToxicity(message) {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.toxicity) return;

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
          message.channel,
        );
      },
    );
  }
}

const activeModerationLocks = new Set();

async function triggerAIModeration(
  guild,
  userId,
  anomalyType,
  contextData,
  channel = null,
) {
  if (activeModerationLocks.has(userId)) return;
  activeModerationLocks.add(userId);

  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

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
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(30_000),
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
          await sendActionEmbed(
            channel,
            member.id,
            "timeout",
            reason,
            durationMinutes || 10,
          );
          break;
        case "kick":
          await modTools.kick(member, finalReason);
          await sendActionEmbed(channel, member.id, "kick", reason);
          break;
        case "ban":
          await modTools.ban(member, 0, finalReason);
          await sendActionEmbed(channel, member.id, "ban", reason);
          break;
        case "ban-wipe":
          await modTools.ban(member, 1, finalReason);
          await sendActionEmbed(channel, member.id, "ban-wipe", reason);
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

export async function checkHackedAccountSpam(message, imageUrls) {
  const cfg = await loadConfig();
  if (!cfg.enabled) return;

  const member = await message.guild.members
    .fetch(message.author.id)
    .catch(() => null);
  if (!member || member.id === message.guild.ownerId || member.user.bot) return;
  const isMod = await modTools.checkModerationPermission(
    message.guild,
    member.id,
    "mod",
  );
  if (isMod) return;

  if (activeModerationLocks.has(member.id)) return;
  activeModerationLocks.add(member.id);

  try {
    console.log(
      `[AutoMod] Running proactive scam scrutiny on ${member.user.tag}...`,
    );

    const promptText = `
      You are a strict Discord Trust & Safety AI. Analyze this message (and any attached images) uploaded by a user.
      A common hacked account scam involves posting fake crypto exchanges, fake Nitro giveaways, or fake server promotions, often accompanied by an @everyone or @here ping and a suspicious link.
      Look closely at the text and images. Does this contain clear indicators of a hacked account scam (e.g. 'I won 0.5 BTC', 'Free Discord Nitro', 'Join this server to claim', fake withdrawal screenshots)?
      Return true ONLY if you are absolutely confident it is a malicious scam/promotion. If it is just normal chat, memes, or a legitimate announcement, return false.
    `;

    const modelObj = getLanguageModel(config.model.provider, config.model.name);

    const contentArray = [
      { type: "text", text: promptText },
      { type: "text", text: `Message Content: "${message.content}"` },
    ];

    if (imageUrls && imageUrls.length > 0) {
      imageUrls.forEach((url) => {
        contentArray.push({ type: "image", image: new URL(url) });
      });
    }

    const result = await generateObject({
      model: modelObj,
      messages: [
        {
          role: "user",
          content: contentArray,
        },
      ],
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(30_000),
      schema: z.object({
        isHackedPromo: z
          .boolean()
          .describe(
            "Whether this looks like a hacked account posting a crypto/giveaway scam",
          ),
        reason: z
          .string()
          .describe("Explanation for why it was classified this way"),
      }),
    });

    const { isHackedPromo, reason } = result.object;

    if (isHackedPromo) {
      console.log(
        `[AutoMod] Hacked account scam detected for ${member.user.tag}: ${reason}`,
      );

      ignoredDeletes.add(message.id);
      await message
        .delete()
        .catch((err) =>
          console.error("[AutoMod] Failed to delete scam message:", err),
        );

      await modTools
        .timeout(member, 40320, "[AutoMod] Hacked Account Scam Promotion")
        .catch((err) =>
          console.error("[AutoMod] Failed to timeout user:", err),
        );

      const rolesToRemove = member.roles.cache.filter(
        (r) => r.id !== message.guild.id,
      );
      if (rolesToRemove.size > 0) {
        await member.roles
          .remove(rolesToRemove, "[AutoMod] Quarantine Hacked Account")
          .catch((err) =>
            console.error("[AutoMod] Failed to remove roles:", err),
          );
      }

      const dmContainer = new ContainerBuilder().setAccentColor(EMBED_COLOR);

      const dmHeader = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-*sᴇʀᴠᴇʀ sᴇᴄᴜʀɪᴛʏ*-\n## ${i("WARNING")} ᴀᴄᴄᴏᴜɴᴛ ᴄᴏᴍᴘʀᴏᴍɪsᴇᴅ\nᴏᴜʀ sʏsᴛᴇᴍ ʜᴀs ᴅᴇᴛᴇᴄᴛᴇᴅ ᴛʜᴀᴛ ʏᴏᴜʀ ᴀᴄᴄᴏᴜɴᴛ ᴍᴀʏ ʙᴇ ᴄᴏᴍᴘʀᴏᴍɪsᴇᴅ.\n\n> ᴀʟʟ sᴇʀᴠᴇʀ ᴀᴜᴛʜᴏʀɪᴛɪᴇs ʜᴀᴠᴇ ʙᴇᴇɴ ʀᴇᴠᴏᴋᴇᴅ ᴀɴᴅ ʏᴏᴜ ʜᴀᴠᴇ ʙᴇᴇɴ ᴘʟᴀᴄᴇᴅ ɪɴ ǫᴜᴀʀᴀɴᴛɪɴᴇ ᴛᴏ ᴘʀᴏᴛᴇᴄᴛ ᴛʜᴇ sᴇʀᴠᴇʀ.\n\nᴘʟᴇᴀsᴇ ʀᴇᴀᴄʜ ᴏᴜᴛ ᴛᴏ ᴀ ᴍᴏᴅᴇʀᴀᴛᴏʀ ᴛᴏ ʀᴇsᴏʟᴠᴇ ᴛʜɪs ᴍᴀɴᴜᴀʟʟʏ ᴏɴᴄᴇ ʏᴏᴜ ʜᴀᴠᴇ sᴇᴄᴜʀᴇᴅ ʏᴏᴜʀ ᴀᴄᴄᴏᴜɴᴛ.`,
          ),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(
            message.guild.iconURL({ dynamic: true, size: 256 }) ||
              message.client.user.displayAvatarURL(),
          ),
        );

      dmContainer.addSectionComponents(dmHeader);
      addFooter(dmContainer);

      await member
        .send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 })
        .catch((err) => console.error("[AutoMod] Failed to DM user:", err));

      const logChannel = await message.guild.channels
        .fetch("1489967421283369011")
        .catch((err) => {
          console.error("[AutoMod] Failed to fetch log channel:", err);
          return null;
        });

      if (logChannel) {
        const logContainer = new ContainerBuilder().setAccentColor(EMBED_COLOR);

        const logHeader = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `-*ᴀᴜᴛᴏᴍᴏᴅ ᴀʟᴇʀᴛ*-\n## ${i("WARNING")} ʜᴀᴄᴋᴇᴅ ᴀᴄᴄᴏᴜɴᴛ sᴘᴀᴍ ᴅᴇᴛᴇᴄᴛᴇᴅ\n**ᴜsᴇʀ:** <@${member.id}> (${member.user.tag})\n**ᴀᴄᴛɪᴏɴ ᴛᴀᴋᴇɴ:** ᴍᴇssᴀɢᴇ ᴅᴇʟᴇᴛᴇᴅ, 28-ᴅᴀʏ ᴛɪᴍᴇᴏᴜᴛ, ʀᴏʟᴇs sᴛʀɪᴘᴘᴇᴅ`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(
              member.user.displayAvatarURL({ dynamic: true, size: 256 }),
            ),
          );

        logContainer.addSectionComponents(logHeader);
        logContainer.addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small),
        );
        logContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `\`\`\`ansi\n\u001b[1;37m ᴀɪ ᴀɴᴀʟʏsɪs ʀᴇᴀsᴏɴ\u001b[0m\n\n\u001b[0m${reason}\u001b[0m\`\`\`\n*[AutoMod] Proactive AI Scrutiny triggered on suspicious message/image.*`,
          ),
        );
        addFooter(logContainer);

        await logChannel
          .send({
            components: [logContainer],
            flags: MessageFlags.IsComponentsV2,
          })
          .catch((err) => console.error("[AutoMod] Failed to send log:", err));
      } else {
        console.error(
          "[AutoMod] Could not find log channel 1489967421283369011",
        );
      }
    }
  } catch (error) {
    console.error("[AutoMod] Image Scrutiny Error:", error);
  } finally {
    activeModerationLocks.delete(member.id);
  }
}

function getModLogChannel(guild) {
  const id = rootConfig.modLogChannelId;
  if (id) {
    const channel = guild.channels.cache.get(id);
    if (channel) return channel;
  }
  return guild.systemChannel;
}

const DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.MentionEveryone,
];

export async function checkChannelCreate(channel, executor) {
  await runNukeCheck(channel.guild, executor, {
    counterKey: "channelCreateCount",
    limitKey: "channelCreate",
    defaultLimit: 3,
    reason: "Channel Creation",
    actionType: "ban",
  });
}

export async function checkChannelUpdate(oldChannel, newChannel, executor) {
  await runNukeCheck(newChannel.guild, executor, {
    counterKey: "channelUpdateCount",
    limitKey: "channelUpdate",
    defaultLimit: 5,
    reason: `Channel Rename ("${oldChannel.name}" → "${newChannel.name}")`,
    actionType: "ban",
  });
}

export async function checkRoleCreate(role, executor) {
  await runNukeCheck(role.guild, executor, {
    counterKey: "roleCreateCount",
    limitKey: "roleCreate",
    defaultLimit: 3,
    reason: "Role Creation",
    actionType: "ban",
  });
}

export async function checkRoleUpdate(oldRole, newRole, executor) {
  const cfg = getConfigSync();
  if (!cfg.enabled || !cfg.raid) return;
  if (!executor || executor.bot) return;
  const guild = newRole.guild;
  if (executor.id === guild.ownerId) return;

  const addedDangerous = DANGEROUS_PERMISSIONS.filter(
    (perm) => !oldRole.permissions.has(perm) && newRole.permissions.has(perm),
  );
  if (addedDangerous.length === 0) return;

  if (await isWhitelisted(guild, executor.id)) {
    await sendAntiNukeAlert(
      guild,
      `-*ᴀɴᴛɪ-ɴᴜᴋᴇ ᴀʟᴇʀᴛ*-\n## ${i("WARNING")} ᴘʀɪᴠɪʟᴇɢᴇ ᴄʜᴀɴɢᴇ\n**ʀᴏʟᴇ:** ${newRole.name}\n**ʙʏ:** <@${executor.id}> (${executor.tag})\n\n> Dangerous permissions were granted by a trusted account. No action taken — please verify this was intentional.`,
    );
    return;
  }

  console.log(
    `[ANTI-NUKE] Privilege escalation on role "${newRole.name}" by ${executor.tag}. Reverting.`,
  );

  await newRole
    .setPermissions(
      oldRole.permissions,
      "[ANTI-NUKE] Reverting unauthorized privilege escalation",
    )
    .catch((err) =>
      console.error(
        "[ANTI-NUKE] Failed to revert role permissions:",
        err.message,
      ),
    );

  await instantAntiNuke(
    guild,
    executor.id,
    `Privilege Escalation: dangerous permissions were granted to role "${newRole.name}" and have been reverted.`,
    "ban",
    getModLogChannel(guild),
  );
}

export async function checkMassUnban(guild, executor) {
  await runNukeCheck(guild, executor, {
    counterKey: "banRemoveCount",
    limitKey: "banRemove",
    defaultLimit: 5,
    reason: "Unban",
    actionType: "ban",
  });
}

export async function checkWebhookCreate(guild, executor) {
  await runNukeCheck(guild, executor, {
    counterKey: "webhookCreateCount",
    limitKey: "webhookCreate",
    defaultLimit: 3,
    reason: "Webhook Creation",
    actionType: "ban",
  });
}

export async function checkGuildUpdate(guild, executor, changeSummary) {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.raid) return;
  if (!executor || executor.bot) return;
  if (executor.id === guild.ownerId) return;

  const channel = getModLogChannel(guild);
  if (!channel) return;

  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
  container.addSectionComponents(
    new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-*ᴀɴᴛɪ-ɴᴜᴋᴇ ᴀʟᴇʀᴛ*-\n## ${i("WARNING")} sᴇʀᴠᴇʀ sᴇᴛᴛɪɴɢs ᴄʜᴀɴɢᴇᴅ\n**ʙʏ:** <@${executor.id}> (${executor.tag})\n\n${changeSummary || "Server settings were updated."}`,
      ),
    ),
  );
  addFooter(container);
  await channel
    .send({ components: [container], flags: MessageFlags.IsComponentsV2 })
    .catch(() => {});
}

export async function checkBotAdd(guild, botMember, executor) {
  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.raid) return;

  const channel = getModLogChannel(guild);
  if (!channel) return;

  const addedBy = executor
    ? `<@${executor.id}> (${executor.tag})`
    : "Unknown (no recent audit entry)";

  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
  container.addSectionComponents(
    new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-*ᴀɴᴛɪ-ɴᴜᴋᴇ ᴀʟᴇʀᴛ*-\n## ${i("WARNING")} ɴᴇᴡ ʙᴏᴛ ᴀᴅᴅᴇᴅ\n**ʙᴏᴛ:** <@${botMember.id}> (${botMember.user.tag})\n**ᴀᴅᴅᴇᴅ ʙʏ:** ${addedBy}\n\n> ɪғ ᴛʜɪs ʙᴏᴛ ᴡᴀs ɴᴏᴛ ᴀᴜᴛʜᴏʀɪᴢᴇᴅ, ʀᴇᴍᴏᴠᴇ ɪᴛ ᴀɴᴅ ʀᴇᴠɪᴇᴡ ɪᴛs ᴘᴇʀᴍɪssɪᴏɴs ɪᴍᴍᴇᴅɪᴀᴛᴇʟʏ.`,
      ),
    ),
  );
  addFooter(container);
  await channel
    .send({ components: [container], flags: MessageFlags.IsComponentsV2 })
    .catch(() => {});
}
