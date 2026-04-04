import dotenv from "dotenv";
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  MessageFlags,
} from "discord.js";
import { eReply } from "./utils/embed.js";
import { i } from "./utils/icons.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readdirSync } from "fs";
import ffmpegPath from "ffmpeg-static";
import config from "../config.js";
import { updateStatusMessage } from "./utils/statusUpdater.js";
import {
  handleVerificationApply,
  handleApprovalAction,
  handleNicknameModal,
} from "./utils/verificationHandler.js";
import { handleAutomodInteraction } from "./commands/automod.js";
import { handleTicketInteraction } from "./utils/ticketHandler.js";
import { buildStatusPayload } from "./commands/status.js";

if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
  const ffmpegDir = dirname(ffmpegPath);
  const sep = process.platform === "win32" ? ";" : ":";
  process.env.PATH = `${ffmpegDir}${sep}${process.env.PATH}`;
  console.log(`[INFO] ffmpeg path set to: ${ffmpegPath}`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();

const commandsPath = join(__dirname, "commands");

import { loadCommands } from "./utils/commandLoader.js";
const loadedCommands = await loadCommands();

for (const command of loadedCommands) {
  client.commands.set(command.data.name, command);
  console.log(`[INFO] Loaded command: ${command.data.name}`);
}

const eventsPath = join(__dirname, "events");
const eventFiles = readdirSync(eventsPath).filter((file) =>
  file.endsWith(".js"),
);

console.log(`[DEBUG] Found ${eventFiles.length} event files to load`);

for (const file of eventFiles) {
  const filePath = join(eventsPath, file);
  const event = await import(`file://${filePath}`);

  console.log(
    `[DEBUG] Registering event: ${event.default.name} from ${file} (once: ${!!event.default.once})`,
  );

  if (event.default.once) {
    client.once(event.default.name, (...args) =>
      event.default.execute(...args),
    );
  } else {
    client.on(event.default.name, (...args) => event.default.execute(...args));
  }
  console.log(`[INFO] Loaded event: ${event.default.name}`);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("tsetup_modal_")
  ) {
    await handleTicketInteraction(interaction);
    return;
  }

  if (interaction.isButton()) {
    if (
      interaction.customId === "automod_toggle_master" ||
      interaction.customId === "automod_edit_limits" ||
      interaction.customId === "automod_toggle_spam" ||
      interaction.customId === "automod_toggle_raid" ||
      interaction.customId === "automod_toggle_toxicity"
    ) {
      await handleAutomodInteraction(interaction);
      return;
    }

    if (interaction.customId === "refresh_stats") {
      await interaction.deferUpdate();
      await updateStatusMessage(interaction.client);
      return;
    }

    if (interaction.customId === "refresh_bot_status") {
      await interaction.update(
        await buildStatusPayload(interaction.client, interaction.guild),
      );
      return;
    }

    if (
      interaction.customId.startsWith("ticket_") ||
      interaction.customId.startsWith("tsetup_") ||
      interaction.customId.startsWith("tkt_")
    ) {
      await handleTicketInteraction(interaction);
      return;
    }
  }

  if (interaction.isUserSelectMenu()) {
    if (interaction.customId.startsWith("tsetup_")) {
      await handleTicketInteraction(interaction);
      return;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "dev_check") {
      await interaction.reply(
        eReply(
          `${i("SUCCESS")} ᴅᴇᴠɪᴄᴇ ᴄʜᴇᴄᴋ`,
          "ʏᴏᴜ'ʀᴇ ᴀʟʟ sᴇᴛ! ғᴇᴇʟ ғʀᴇᴇ ᴛᴏ ᴇxᴘʟᴏʀᴇ.",
        ),
      );
      return;
    }

    if (
      interaction.customId === "verify_friends" ||
      interaction.customId === "verify_member"
    ) {
      await handleVerificationApply(interaction);
      return;
    }

    if (
      interaction.customId.startsWith("approve_") ||
      interaction.customId.startsWith("reject_")
    ) {
      await handleApprovalAction(interaction);
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("nickname_modal_")) {
      await handleNicknameModal(interaction);
      return;
    }
    if (interaction.customId === "automod_limits_modal") {
      await handleAutomodInteraction(interaction);
      return;
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith("tsetup_")) {
      await handleTicketInteraction(interaction);
      return;
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}`);
    console.error(error);

    const errorMessage = eReply(
      `${i("ERROR")} ᴇʀʀᴏʀ`,
      "ᴛʜᴇʀᴇ ᴡᴀs ᴀɴ ᴇʀʀᴏʀ ᴡʜɪʟᴇ ᴇxᴇᴄᴜᴛɪɴɢ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!",
    );

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Graceful shutdown handlers for conversation persistence
import contextManager from "./agents/tools/context-manager.js";

async function gracefulShutdown(signal) {
  console.log(
    `\n[${signal}] Received shutdown signal, saving conversations...`,
  );
  try {
    await contextManager.shutdown();
    console.log("[SHUTDOWN] All conversations saved to Supabase");
    process.exit(0);
  } catch (error) {
    console.error("[SHUTDOWN] Error during shutdown:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("beforeExit", () => {
  console.log("[SHUTDOWN] Process before exit, forcing save...");
  contextManager.forceSaveAll().catch(console.error);
});

client.login(config.token);

export default client;
