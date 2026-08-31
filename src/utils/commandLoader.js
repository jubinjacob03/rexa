import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readdirSync } from "fs";

export const REGISTERED_COMMANDS = [
  "setup-ticket",
  "embed-builder",
  "purge",
  "private-vc",
  "private-vc-add",
  "private-vc-remove",
];

export async function loadCommands(commandsDir = "../commands", options = {}) {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const commandsPath = join(currentDir, commandsDir);
  const commandFiles = readdirSync(commandsPath).filter((file) =>
    file.endsWith(".js"),
  );
  const allowlist = Array.isArray(options.allowlist) ? options.allowlist : null;

  const commands = [];

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    try {
      const commandModule = await import(`file://${filePath}`);
      const command = commandModule.default;

      if (command && "data" in command && "execute" in command) {
        if (!allowlist || allowlist.includes(command.data?.name)) {
          commands.push(command);
        }
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
        );
      }
    } catch (error) {
      console.error(`[ERROR] Failed to load command at ${filePath}:`, error);
    }
  }

  return commands;
}
