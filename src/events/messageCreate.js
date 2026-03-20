import { Events } from "discord.js";
import config from "../../config.js";

const WAR_RESULTS_CHANNEL = "1473075469028167814";
const ANNOUNCEMENTS_CHANNEL = "1473075468805738540";
const NO_MENTION_CHANNEL = "1482781492106236036";

const processedMessages = new Set();

const GUARANTEED_EMOJIS = ["🔥", "❤️", "💪", "👏", "⚡", "✨"];
const RANDOM_EMOJIS = [
  "😍",
  "🤩",
  "😎",
  "💯",
  "🎉",
  "🎊",
  "👍",
  "🙌",
  "💥",
  "⭐",
  "🌟",
  "💫",
  "🏆",
  "👑",
  "💎",
  "🎯",
  "🚀",
  "💖",
  "💝",
  "🤯",
  "😤",
  "🔴",
  "🟠",
  "🟡",
  "🏴‍☠️",
  "⚔️",
  "🛡️",
  "💣",
  "🎖️",
  "🥇",
  "🥈",
  "🥉",
  "🎪",
  "🎭",
  "🎬",
  "🎮",
  "🎲",
  "🎰",
  "🎺",
  "🎸",
  "🔱",
  "⚜️",
  "🦅",
  "🦁",
  "🐉",
  "🦈",
  "🦾",
  "🧨",
  "💀",
  "☠️",
  "🗡️",
  "🏹",
  "🪓",
  "⚙️",
  "🔧",
  "🔩",
];

async function addReactionsToImage(message) {
  try {
    const selectedEmojis = [...GUARANTEED_EMOJIS];
    const shuffled = [...RANDOM_EMOJIS].sort(() => Math.random() - 0.5);
    const neededCount = 20 - GUARANTEED_EMOJIS.length;
    selectedEmojis.push(...shuffled.slice(0, neededCount));

    selectedEmojis.sort(() => Math.random() - 0.5);

    for (const emoji of selectedEmojis) {
      await message.react(emoji).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } catch (error) {
    console.error("[ERROR] Failed to add reactions:", error);
  }
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

    const isMentioned = message.mentions.has(message.client.user.id);
    const isNoMentionChannel = message.channel.id === NO_MENTION_CHANNEL;
    const isBroadcastMention = message.mentions.everyone; // true for both @everyone and @here

    // Ignore @everyone / @here pings unless the bot is explicitly mentioned by ID
    if (isBroadcastMention && !isMentioned) return;

    if (isMentioned || isNoMentionChannel) {
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

      try {
        await message.channel.sendTyping();

        const question = message.content
          .replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "")
          .trim();

        if (!question) {
          await message.reply("Yes? How can I help you? 🤔");
          return;
        }

        console.log(`[AI] Question from ${message.author.tag}: ${question}`);

        const { processMessage } = await import("../agents/agent.js");
        const result = await processMessage(
          message.author.id,
          message.guild?.id || "dm",
          question,
        );

        if (result.success) {
          if (!result.response || result.response.trim() === "") {
            console.warn(`[AI] Empty response for question: "${question}"`);
            await message.reply(
              "Sorry, I understood your question but couldn't generate a proper response. Can you try asking in a different way?",
            );
            return;
          }

          const response = result.response;

          if (result.embeds?.length > 0) {
            await message.reply({
              content: response || undefined,
              embeds: result.embeds,
            });
          } else if (response.length <= 2000) {
            await message.reply(response);
          } else {
            const chunks = response.match(/[\s\S]{1,1900}/g) || [response];
            await message.reply(chunks[0]);
            for (let i = 1; i < chunks.length; i++) {
              await message.channel.send(chunks[i]);
            }
          }

          console.log(`[AI] Responded to ${message.author.tag}`);
        } else {
          await message.reply(
            "Sorry, I encountered an error processing your request. Please try again.",
          );
          console.error("[AI] Error:", result.error);
        }
      } catch (error) {
        console.error("[AI] Failed to process message:", error);
        await message
          .reply("Sorry, something went wrong. Please try again later.")
          .catch(() => {});
      }
      return;
    }

    if (
      message.channel.id === WAR_RESULTS_CHANNEL &&
      message.attachments.size > 0
    ) {
      addReactionsToImage(message);
      return;
    }

    if (config.imageOnlyChannels.includes(message.channel.id)) {
      if (message.attachments.size > 0) {
        return;
      }

      if (message.channel.id === "1473075469028167811") {
        const cleanContent = message.content
          .replace(/<@!?\d+>/g, "") // Remove user mentions
          .replace(/@everyone/g, "") // Remove @everyone
          .replace(/@here/g, "") // Remove @here
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

        const reply = await message.channel.send({
          content: notificationText,
        });

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
