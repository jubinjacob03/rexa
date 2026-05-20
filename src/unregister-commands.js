import { REST, Routes } from "discord.js";
import config from "../config.js";

const rest = new REST().setToken(config.token);

(async () => {
  try {
    console.log("[INFO] Unregistering all guild (/) commands...");
    const cleared = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: [] },
    );
    console.log(
      `[SUCCESS] Cleared guild commands. Remaining: ${cleared.length}`,
    );

    console.log("[INFO] Unregistering all global (/) commands...");
    const clearedGlobal = await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: [] },
    );
    console.log(
      `[SUCCESS] Cleared global commands. Remaining: ${clearedGlobal.length}`,
    );
  } catch (error) {
    console.error("[ERROR] Error clearing commands:", error);
    process.exit(1);
  }
})();
