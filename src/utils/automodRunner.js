import { generateObject } from "ai";
import { z } from "zod";
import config, { getLanguageModel } from "../agents/config.js";
import * as modTools from "./moderation.js";
import { loadConfig } from "./automodManager.js";
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
} from "discord.js";
import { ignoredDeletes } from "../events/messageDelete.js";
/**
 * Sends an action embed to the specified channel.
 * @param {import('discord.js').TextChannel} channel - The channel to send the embed to.
 * @param {string} userId - The ID of the user the action was taken against.
 * @param {string} action - The action taken (e.g., 'timeout', 'kick', 'ban').
 * @param {string} reason - The reason for the action.
 * @param {number} [durationMinutes] - The duration of the timeout in minutes, if applicable.
 * @returns {Promise<void>}
 */
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

const TRACKER_TTL = 10000;const WARNING_COOLDOWN = 20 * 60 * 1000;
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

/**
 * Checks if a message is considered spam and takes appropriate action.
 * @param {import('discord.js').Message} message - The message to check.
 * @returns {Promise<void>}
 */
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
    try {
      for (const msgData of tracker.recentMessageIds) {
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
          `User sent ${tracker.messageCount} messages in a few seconds. Messages: ${JSON.stringify(tracker.recentMessages)}`,
          message.channel,
        );
      },
    );
    userTrackers.delete(message.author.id);
  }
}

/**
 * Triggers a warning or an action if the user has already been warned recently.
 * @param {import('discord.js').Guild} guild - The guild where the action is taking place.
 * @param {string} userId - The ID of the user to warn or take action against.
 * @param {import('discord.js').Message|null} message - The message that triggered the warning, if any.
 * @param {string} warningText - The text to include in the warning.
 * @param {Function} actionCallback - The callback to execute if the user has already been warned.
 * @returns {Promise<void>}
 */
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

/**
 * Instantly executes an anti-nuke lockdown action against a user.
 * @param {import('discord.js').Guild} guild - The guild where the action is taking place.
 * @param {string} userId - The ID of the user to lock down.
 * @param {string} reason - The reason for the lockdown.
 * @param {string} [actionType="ban"] - The type of action to take ('ban', 'ban-wipe', 'timeout').
 * @param {import('discord.js').TextChannel|null} [channel=null] - The channel to send the action embed to.
 * @returns {Promise<void>}
 */
async function instantAntiNuke(
  guild,
  userId,
  reason,
  actionType = "ban",
  channel = null,
) {
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
      await sendActionEmbed(channel, member.id, actionType, reason);
    } else if (actionType === "timeout") {
      await modTools.timeout(member, 60, `[ANTI-NUKE] ${reason}`);
      await sendActionEmbed(channel, member.id, "timeout", reason, 60);
    }
  } catch (err) {
    console.error(`[ANTI-NUKE] Failed to execute lockdown:`, err.message);
  }
}

/**
 * Checks if a channel deletion is part of a raid and takes appropriate action.
 * @param {import('discord.js').Channel} channel - The deleted channel.
 * @param {import('discord.js').User} executor - The user who deleted the channel.
 * @returns {Promise<void>}
 */
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
          channel.guild.systemChannel,
        );
      },
    );
    userTrackers.delete(executor.id);
  }
}

/**
 * Checks if a member update (like nickname change) is part of a raid and takes appropriate action.
 * @param {import('discord.js').GuildMember} oldMember - The member before the update.
 * @param {import('discord.js').GuildMember} newMember - The member after the update.
 * @returns {Promise<void>}
 */
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

/**
 * Checks if a message deletion is part of a raid and takes appropriate action.
 * @param {import('discord.js').Message} message - The deleted message.
 * @param {import('discord.js').User} executor - The user who deleted the message.
 * @returns {Promise<void>}
 */
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

/**
 * Checks if a message contains toxic content and takes appropriate action.
 * @param {import('discord.js').Message} message - The message to check.
 * @returns {Promise<void>}
 */
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

/**
 * Triggers AI-based moderation to determine the appropriate action for an anomaly.
 * @param {import('discord.js').Guild} guild - The guild where the anomaly occurred.
 * @param {string} userId - The ID of the user who caused the anomaly.
 * @param {string} anomalyType - The type of anomaly detected.
 * @param {string} contextData - Additional context data for the AI to analyze.
 * @param {import('discord.js').TextChannel|null} [channel=null] - The channel to send the action embed to.
 * @returns {Promise<void>}
 */
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
      maxTokens: 500,
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

/**
 * Proactively checks if a message and its attachments are part of a hacked account scam.
 * @param {import('discord.js').Message} message - The message to check.
 * @param {string[]} [imageUrls] - Array of image URLs attached to the message.
 * @returns {Promise<void>}
 */
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
      maxTokens: 500,
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
