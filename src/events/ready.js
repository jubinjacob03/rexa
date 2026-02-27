import { Events } from "discord.js";
import { startStatusUpdater } from "../utils/statusUpdater.js";
import { startApiServer } from "../api/server.js";

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

async function addReactionsToMessage(message) {
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

async function retroactivelyAddReactions(client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const channel = guild.channels.cache.get(WAR_RESULTS_CHANNEL);
    if (!channel) {
      console.log("[WARN] War results channel not found");
      return;
    }

    console.log("[INFO] Adding reactions to existing war results images...");

    const messages = await channel.messages.fetch({ limit: 100 });
    let count = 0;

    for (const [, message] of messages) {
      if (message.attachments.size > 0) {
        await addReactionsToMessage(message);
        count++;
      }
    }

    if (count > 0) {
      console.log(
        `[SUCCESS] Added reactions to ${count} existing war results images`,
      );
    }
  } catch (error) {
    console.error("[ERROR] Failed to add retroactive reactions:", error);
  }
}

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[SUCCESS] Shantha logged in as ${client.user.tag}`);
    console.log(`[INFO] Serving ${client.guilds.cache.size} guild(s)`);

    startStatusUpdater(client);
    startApiServer(client);

    setTimeout(() => retroactivelyAddReactions(client), 3000);
  },
};
