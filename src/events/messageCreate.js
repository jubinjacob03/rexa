import { Events } from "discord.js";
import config from "../../config.js";

const WAR_RESULTS_CHANNEL = "1473075469028167814";

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
    if (message.author.bot) return;

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
