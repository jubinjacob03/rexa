import { REST, Routes } from "discord.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readdirSync } from "fs";
import config from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { loadCommands } from "./utils/commandLoader.js";

const loadedCommands = await loadCommands();
const commands = loadedCommands.map(cmd => {
  console.log(`[INFO] Processed command for deployment: ${cmd.data.name}`);
  return cmd.data.toJSON();
});

const rest = new REST().setToken(config.token);

(async () => {
  try {
    console.log(
      `[INFO] Started refreshing ${commands.length} application (/) commands.`,
    );
    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );

    console.log(
      `[SUCCESS] Successfully reloaded ${data.length} application (/) commands.`,
    );
    console.log("[INFO] Commands registered:");
    data.forEach((cmd) => console.log(`  - /${cmd.name}`));
  } catch (error) {
    console.error("[ERROR] Error deploying commands:", error);
  }
})();
