import { Events } from "discord.js";
import { startStatusUpdater } from "../utils/statusUpdater.js";
import { startApiServer } from "../api/server.js";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`[SUCCESS] Shantha logged in as ${client.user.tag}`);
    console.log(`[INFO] Serving ${client.guilds.cache.size} guild(s)`);

    startStatusUpdater(client);
    startApiServer(client);
  },
};
