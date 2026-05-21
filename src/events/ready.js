import { Events } from "discord.js";
import { startStatusUpdater } from "../utils/statusUpdater.js";
import { startApiServer } from "../api/server.js";
import { initIcons } from "../utils/icons.js";


/**
 * Handles the ClientReady event.
 * @module events/ready
 */
export default {
  name: Events.ClientReady,
  once: true,
  /**
   * Executes the event handler.
   * @param {import("discord.js").Client} client - The Discord client.
   * @returns {Promise<void>}
   */
  async execute(client) {
    console.log(`[SUCCESS] Shantha logged in as ${client.user.tag}`);
    console.log(`[INFO] Serving ${client.guilds.cache.size} guild(s)`);

    initIcons(client);

    try {
      console.log("[INFO] Initializing AI Agent and tools...");
      const { initializeAgent } = await import("../agents/agent.js");
      await initializeAgent(client);
      console.log("[SUCCESS] AI Agent and all tools initialized successfully");
      console.log("[INFO] Agent is ready to:");
      console.log("  • Search knowledge base (RAG)");
      console.log("  • Get server info (members, roles, stats)");
      console.log("  • Execute commands (Shantha & Remani)");
      console.log("  • Search the web and fetch URLs");
      console.log("  • Create rich embeds");
    } catch (err) {
      console.error("[ERROR] Failed to initialize AI Agent:", err);
      console.error("[ERROR] Agent will not be available for this session");
    }

    startStatusUpdater(client);
    startApiServer(client);
  },
};
