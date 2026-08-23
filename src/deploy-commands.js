import { REST, Routes } from "discord.js";
import config from "../config.js";
import { loadCommands, REGISTERED_COMMANDS } from "./utils/commandLoader.js";
import { installGlobalConsole } from "./utils/logger.js";

installGlobalConsole();

const loadedCommands = await loadCommands(undefined, {
  allowlist: REGISTERED_COMMANDS,
});
const commands = loadedCommands.map((cmd) => {
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
    process.exit(0);
  } catch (error) {
    console.error("[ERROR] Error deploying commands:", error);
    process.exit(1);
  }
})();
