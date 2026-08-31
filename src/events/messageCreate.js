import { Events, MessageFlags } from "discord.js";
import config from "../../config.js";
import {
  checkSpam,
  checkToxicity,
  checkHackedAccountSpam,
} from "../utils/automodRunner.js";
import { eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";
import { processMessage } from "../agents/agent.js";

const ANNOUNCEMENTS_CHANNEL = "1473075468805738540";
const NO_MENTION_CHANNELS = new Set([
  "1482781492106236036",
  "1485024851109613758",
]);

const processedMessages = new Set();

const AI_DAILY_LIMIT = 50;
const aiUsage = new Map();

function getAiUsageKey(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return `${userId}_${today}`;
}

function checkAiRateLimit(userId) {
  const key = getAiUsageKey(userId);
  const count = aiUsage.get(key) || 0;
  if (count >= AI_DAILY_LIMIT) return false;
  aiUsage.set(key, count + 1);
  return true;
}

function refundAiRateLimit(userId) {
  const key = getAiUsageKey(userId);
  const count = aiUsage.get(key) || 0;
  if (count > 0) aiUsage.set(key, count - 1);
}

setInterval(
  () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const key of aiUsage.keys()) {
      if (!key.endsWith(today)) aiUsage.delete(key);
    }
  },
  60 * 60 * 1000,
).unref();

const userQueues = new Map();

function enqueueForUser(userId, fn) {
  const prev = userQueues.get(userId) || Promise.resolve();
  const next = prev.then(fn, fn);
  userQueues.set(userId, next);
  next.finally(() => {
    if (userQueues.get(userId) === next) userQueues.delete(userId);
  });
  return next;
}

const MAX_CHUNK_LENGTH = 3800;

function chunkResponse(text, size = MAX_CHUNK_LENGTH) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > size) {
    let cut = remaining.lastIndexOf("\n", size);
    if (cut < size * 0.6) cut = remaining.lastIndexOf(" ", size);
    if (cut < size * 0.6) cut = size;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\s+/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.channel.id === ANNOUNCEMENTS_CHANNEL) {
      const isOwner = message.guild?.ownerId === message.author.id;
      const isBot = message.author.bot;
      const isWebhook = !!message.webhookId;
      const isSystem = message.system;
      if (!isOwner && !isBot && !isWebhook && !isSystem) {
        await message.delete().catch(() => {});
      }
      return;
    }

    if (message.author.bot) return;

    if (!message.guild) {
      return;
    }
    await Promise.allSettled([checkSpam(message), checkToxicity(message)]);

    if (message.attachments.size >= 1) {
      const imageUrls = [];
      message.attachments.forEach((att) => {
        if (att.contentType && att.contentType.startsWith("image/")) {
          imageUrls.push(att.url);
        }
      });

      if (imageUrls.length >= 1) {
        checkHackedAccountSpam(message, imageUrls).catch((err) => {
          console.error("[AutoMod] Async Image Scrutiny Error:", err);
        });
      }
    } else if (
      message.content.match(/(https?:\/\/[^\s]+)/g) &&
      (message.content.includes("@everyone") ||
        message.content.includes("@here"))
    ) {
      checkHackedAccountSpam(message, []).catch((err) => {
        console.error("[AutoMod] Async Text Scrutiny Error:", err);
      });
    }

    const isMentioned = message.mentions.has(message.client.user.id, {
      ignoreEveryone: true,
    });
    const isNoMentionChannel = NO_MENTION_CHANNELS.has(message.channel.id);
    const isBroadcastMention = message.mentions.everyone;
    const isAITicketChannel = message.channel.topic === "ticket_ai_enabled";

    if (isBroadcastMention && !isMentioned) return;

    if (isMentioned || isNoMentionChannel || isAITicketChannel) {
      if (processedMessages.has(message.id)) {
        return;
      }
      processedMessages.add(message.id);

      if (processedMessages.size > 100) {
        const firstId = processedMessages.values().next().value;
        processedMessages.delete(firstId);
      }

      if (!checkAiRateLimit(message.author.id)) {
        await message
          .reply(
            eSend(
              `${i("TIMER")} ᴅᴀɪʟʏ ʟɪᴍɪᴛ ʀᴇᴀᴄʜᴇᴅ`,
              "ʏᴏᴜ'ᴠᴇ ᴜsᴇᴅ ᴀʟʟ **50** ᴀɪ ᴍᴇssᴀɢᴇs ғᴏʀ ᴛᴏᴅᴀʏ. ᴛʀʏ ᴀɢᴀɪɴ ᴛᴏᴍᴏʀʀᴏᴡ!",
            ),
          )
          .catch(() => {});
        return;
      }

      message.channel.sendTyping().catch(() => {});

      enqueueForUser(message.author.id, async () => {
        let typingDone = false;
        const keepTyping = () => {
          if (typingDone) return;
          message.channel.sendTyping().catch(() => {});
          setTimeout(keepTyping, 9000);
        };
        setTimeout(keepTyping, 9000);

        try {
          let question = message.content
            .replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "")
            .replace(/<@&\d+>/g, "")
            .trim();

          const imageUrls = [];
          for (const att of message.attachments.values()) {
            if (att.contentType?.startsWith("image/")) imageUrls.push(att.url);
          }
          if (message.reference?.messageId) {
            try {
              const ref = await message.channel.messages.fetch(
                message.reference.messageId,
              );
              for (const att of ref.attachments.values()) {
                if (att.contentType?.startsWith("image/"))
                  imageUrls.push(att.url);
              }
            } catch {}
          }
          if (imageUrls.length > 0) {
            question += `\n[Attached images: ${imageUrls.join(" , ")}]`;
          }

          if (!question) {
            await message.reply({
              ...eSend(`${i("BOT")} Shantha`, "ʏᴇs? ʜᴏᴡ ᴄᴀɴ ɪ ʜᴇʟᴘ ʏᴏᴜ?"),
            });
            return;
          }

          console.log(`[AI] Question from ${message.author.tag}: ${question}`);

          const result = await processMessage(
            message.author.id,
            message.guild?.id || "dm",
            question,
            message.member?.displayName || message.author.username,
          );

          const safeReply = async (payload) => {
            const guarded =
              typeof payload === "string"
                ? { content: payload, allowedMentions: { parse: ["users"] } }
                : { allowedMentions: { parse: ["users"] }, ...payload };
            try {
              return await message.reply(guarded);
            } catch (err) {
              try {
                return await message.channel.send(guarded);
              } catch {
                throw err;
              }
            }
          };

          if (result.success) {
            const response = result.response || "";
            const hasEmbeds = result.embeds?.length > 0;
            const hasComponents = result.components?.length > 0;
            const hasFiles = result.files?.length > 0;

            if (hasFiles) {
              await safeReply({
                content: response || undefined,
                files: result.files,
              });
            } else if (hasEmbeds || hasComponents) {
              await safeReply({
                content: response || undefined,
                embeds: result.embeds,
                components: result.components,
                flags: hasComponents ? MessageFlags.IsComponentsV2 : undefined,
              });
            } else if (!response || response.trim() === "") {
              console.warn(`[AI] Empty response for question: "${question}"`);
              await safeReply(
                eSend(
                  `${i("BOT")} Shantha`,
                  "sᴏʀʀʏ, ɪ ᴜɴᴅᴇʀsᴛᴏᴏᴅ ʏᴏᴜʀ ǫᴜᴇsᴛɪᴏɴ ʙᴜᴛ ᴄᴏᴜʟᴅɴ'ᴛ ɢᴇɴᴇʀᴀᴛᴇ ᴀ ᴘʀᴏᴘᴇʀ ʀᴇsᴘᴏɴsᴇ. ᴄᴀɴ ʏᴏᴜ ᴛʀʏ ᴀsᴋɪɴɢ ɪɴ ᴀ ᴅɪғғᴇʀᴇɴᴛ ᴡᴀʏ?",
                ),
              );
              return;
            } else if (response.length <= MAX_CHUNK_LENGTH) {
              await safeReply(eSend(null, response));
            } else {
              for (const chunk of chunkResponse(response)) {
                await safeReply(eSend(null, chunk));
              }
            }

            console.log(`[AI] Responded to ${message.author.tag}`);
          } else {
            refundAiRateLimit(message.author.id);
            await safeReply(
              eSend(
                `${i("ERROR")} ᴇʀʀᴏʀ`,
                "sᴏʀʀʏ, ɪ ᴇɴᴄᴏᴜɴᴛᴇʀᴇᴅ ᴀɴ ᴇʀʀᴏʀ ᴘʀᴏᴄᴇssɪɴɢ ʏᴏᴜʀ ʀᴇǫᴜᴇsᴛ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ.",
              ),
            );
            console.error("[AI] Error:", result.error);
          }
        } catch (error) {
          refundAiRateLimit(message.author.id);
          console.error("[AI] Failed to process message:", error);
          await message
            .reply(
              eSend(
                `${i("ERROR")} ᴇʀʀᴏʀ`,
                "sᴏʀʀʏ, sᴏᴍᴇᴛʜɪɴɢ ᴡᴇɴᴛ ᴡʀᴏɴɢ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.",
              ),
            )
            .catch(() =>
              message.channel
                .send(
                  eSend(
                    `${i("ERROR")} ᴇʀʀᴏʀ`,
                    "sᴏʀʀʏ, sᴏᴍᴇᴛʜɪɴɢ ᴡᴇɴᴛ ᴡʀᴏɴɢ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.",
                  ),
                )
                .catch(() => {}),
            );
        } finally {
          typingDone = true;
        }
      });
      return;
    }

    if (config.imageOnlyChannels.includes(message.channel.id)) {
      if (message.attachments.size > 0) {
        return;
      }

      if (message.channel.id === "1473075469028167811") {
        const cleanContent = message.content
          .replace(/<@!?\d+>/g, "")
          .replace(/@everyone/g, "")
          .replace(/@here/g, "")
          .trim();

        const hasRoleMentions = /<@&\d+>/g.test(message.content);
        const hasChannelMentions = /<#\d+>/g.test(message.content);

        if (cleanContent === "" && !hasRoleMentions && !hasChannelMentions) {
          return;
        }
      }
      try {
        await message.delete();
        const channelAllowsMentions =
          message.channel.id === "1473075469028167811";
        const notificationText = channelAllowsMentions
          ? `<@${message.author.id}> ᴘʟᴇᴀsᴇ ᴜsᴇ ɢᴇɴᴇʀᴀʟ ᴄʜᴀᴛ ғᴏʀ sᴇɴᴅɪɴɢ ᴍᴇssᴀɢᴇs. ᴏɴʟʏ ᴍᴇᴅɪᴀ ᴀᴛᴛᴀᴄʜᴍᴇɴᴛs ᴀɴᴅ ᴍᴇɴᴛɪᴏɴs ᴀʀᴇ ᴀʟʟᴏᴡᴇᴅ.`
          : `<@${message.author.id}> ᴘʟᴇᴀsᴇ ᴜsᴇ ɢᴇɴᴇʀᴀʟ ᴄʜᴀᴛ ғᴏʀ sᴇɴᴅɪɴɢ ᴍᴇssᴀɢᴇs. ᴏɴʟʏ ᴍᴇᴅɪᴀ ᴀᴛᴛᴀᴄʜᴍᴇɴᴛs ᴀʀᴇ ᴀʟʟᴏᴡᴇᴅ.`;

        const reply = await message.channel.send(
          eSend(`${i("WARNING")} ᴍᴇᴅɪᴀ ᴏɴʟʏ`, notificationText),
        );

        setTimeout(() => {
          reply.delete().catch(() => {});
        }, 5000);

        console.log(
          `[INFO] Deleted text message in image-only channel from ${message.author.tag}`,
        );
      } catch (error) {
        console.error(
          "[ERROR] Error deleting message in image-only channel:",
          error,
        );
      }
    }
  },
};
