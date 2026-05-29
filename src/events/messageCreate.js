import { Events, MessageFlags } from "discord.js";
import config from "../../config.js";
import {
  checkSpam,
  checkToxicity,
  checkHackedAccountSpam,
} from "../utils/automodRunner.js";
import { eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";
import {
  handleVerificationDM,
  getAutoApprove,
} from "../utils/verificationHandler.js";
import { processMessage } from "../agents/agent.js";

const ANNOUNCEMENTS_CHANNEL = "1473075468805738540";
const NO_MENTION_CHANNELS = new Set([
  "1482781492106236036",
  "1485024851109613758",
]);

const processedMessages = new Set();

/**
 * Per-user queue: prevents concurrent processing for the same user
 * @type {Map<string, Promise<void>>}
 */
const userQueues = new Map();

/**
 * Enqueues a function for a specific user.
 * @param {string} userId - The ID of the user.
 * @param {Function} fn - The function to enqueue.
 * @returns {Promise<void>}
 */
function enqueueForUser(userId, fn) {
  const prev = userQueues.get(userId) || Promise.resolve();
  const next = prev.then(fn, fn);
  userQueues.set(userId, next);
  next.finally(() => {
    if (userQueues.get(userId) === next) userQueues.delete(userId);
  });
  return next;
}

/**
 * Handles the MessageCreate event.
 * @module events/messageCreate
 */
export default {
  name: Events.MessageCreate,
  /**
   * Executes the event handler.
   * @param {import("discord.js").Message} message - The created message.
   * @returns {Promise<void>}
   */
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
      if (await getAutoApprove()) {
        const fromVerification = await handleVerificationDM(message);
        if (fromVerification) return;
      }
    }
    await checkSpam(message);
    await checkToxicity(message);

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
      console.log(`[DEBUG] AI mention detected - Message ID: ${message.id}`);

      if (processedMessages.has(message.id)) {
        console.log(`[AI] Skipping duplicate message ${message.id}`);
        return;
      }
      processedMessages.add(message.id);
      console.log(
        `[DEBUG] Added message ${message.id} to processed set (size: ${processedMessages.size})`,
      );

      if (processedMessages.size > 100) {
        const firstId = processedMessages.values().next().value;
        processedMessages.delete(firstId);
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
          const question = message.content
            .replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "")
            .replace(/<@&\d+>/g, "")
            .trim();

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
            try {
              return await message.reply(payload);
            } catch (err) {
              if (err.code === 50035) {
                return await message.channel.send(
                  typeof payload === "string" ? payload : payload,
                );
              }
              throw err;
            }
          };

          if (result.success) {
            const response = result.response || "";
            const hasEmbeds = result.embeds?.length > 0;
            const hasComponents = result.components?.length > 0;

            if (hasEmbeds || hasComponents) {
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
            } else if (response.length <= 4000) {
              await safeReply(eSend(null, response));
            } else {
              const chunks = response.match(/[\s\S]{1,4000}/g) || [];
              for (const chunk of chunks) {
                await safeReply(eSend(null, chunk));
              }
            }

            console.log(`[AI] Responded to ${message.author.tag}`);
          } else {
            await safeReply(
              eSend(
                `${i("ERROR")} ᴇʀʀᴏʀ`,
                "sᴏʀʀʏ, ɪ ᴇɴᴄᴏᴜɴᴛᴇʀᴇᴅ ᴀɴ ᴇʀʀᴏʀ ᴘʀᴏᴄᴇssɪɴɢ ʏᴏᴜʀ ʀᴇǫᴜᴇsᴛ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ.",
              ),
            );
            console.error("[AI] Error:", result.error);
          }
        } catch (error) {
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
