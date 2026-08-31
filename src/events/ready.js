import { Events, ActivityType } from "discord.js";
import { startStatusUpdater } from "../utils/statusUpdater.js";
import { startApiServer } from "../api/server.js";
import { initIcons } from "../utils/icons.js";

const idlePhrases = [
  "✨ reading the chat",
  "🔨 handing out bans",
  "🍵 sipping the tea",
  "💅 unbothered",
  "🛌 rotting in bed",
  "🧊 silently judging",
  "🎧 pretending to listen",
  "🍑 dummy thicc",
  "📱 scrolling mindlessly",
  "🥵 down bad for the chat",
  "😈 absolute menace",
  "💤 sleeping on the job",
  "🌿 touching grass",
  "🔥 watching the drama",
  "🦋 romanticizing my life",
  "🦊 plotting my next move",
  "🍒 serving looks",
];

const setRandomPresence = (client) => {
  const phrase = idlePhrases[Math.floor(Math.random() * idlePhrases.length)];
  client.user.setPresence({
    activities: [{ name: phrase, type: ActivityType.Custom }],
    status: "online",
  });
};

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[SUCCESS] Shantha logged in as ${client.user.tag}`);
    console.log(`[INFO] Serving ${client.guilds.cache.size} guild(s)`);

    await initIcons(client);

    try {
      const { initializeAgent } = await import("../agents/agent.js");
      await initializeAgent(client);
      console.log("[SUCCESS] AI Agent and all tools initialized");
    } catch (err) {
      console.error("[ERROR] Failed to initialize AI Agent:", err);
      console.error("[ERROR] Agent will not be available for this session");
    }

    startStatusUpdater(client);
    startApiServer(client);

    setRandomPresence(client);
    setInterval(() => setRandomPresence(client), 300000).unref();
  },
};
