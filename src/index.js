/**
 * Main entry point for the Shantha bot.
 * Initializes the Discord client, loads commands and events, and handles interactions.
 */
import dotenv from "dotenv";
dotenv.config();

import { installGlobalConsole } from "./utils/logger.js";
installGlobalConsole();

import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  Options,
} from "discord.js";
import { eReply } from "./utils/embed.js";
import { i } from "./utils/icons.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readdirSync } from "fs";
import ffmpegPath from "ffmpeg-static";
import config from "../config.js";
import { updateStatusMessage } from "./utils/statusUpdater.js";
import { handleApprovalAction } from "./utils/verificationHandler.js";
import { handleTicketInteraction } from "./utils/ticketHandler.js";
import {
  postDashboard,
  handleDashboardInteraction,
  handleDashboardModal,
  handleDashboardSelect,
} from "./dashboard/dashboard.js";
import { handleEmbedBuilderInteraction } from "./utils/embedBuilderHandler.js";
import {
  handlePersonalVCButton,
  handlePersonalVCSelect,
  initPersonalVC,
} from "./utils/personalVCManager.js";

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
    GatewayIntentBits.GuildModeration,
  ],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 25,
    ReactionManager: 0,
    ReactionUserManager: 0,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 300, lifetime: 900 },
  },
});

client.commands = new Collection();

import { loadCommands } from "./utils/commandLoader.js";
const loadedCommands = await loadCommands(undefined, {
  allowlist: [
    "setup-ticket",
    "embed-builder",
    "purge",
    "private-vc",
    "private-vc-add",
    "private-vc-remove",
  ],
});

for (const command of loadedCommands) {
  client.commands.set(command.data.name, command);
}
console.log(`[INFO] Loaded ${loadedCommands.length} commands`);

const eventsPath = join(__dirname, "events");
const eventFiles = readdirSync(eventsPath).filter((file) =>
  file.endsWith(".js"),
);

for (const file of eventFiles) {
  const filePath = join(eventsPath, file);
  const event = await import(`file://${filePath}`);

  if (event.default.once) {
    client.once(event.default.name, (...args) =>
      event.default.execute(...args),
    );
  } else {
    client.on(event.default.name, (...args) => event.default.execute(...args));
  }
}
console.log(`[INFO] Loaded ${eventFiles.length} events`);

client.once(Events.ClientReady, async () => {
  console.log(`[INFO] Logged in as ${client.user.tag}`);
  await postDashboard(client);
  await initPersonalVC(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith("shantha_")) {
      await handleDashboardInteraction(interaction);
      return;
    }
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("shantha_")
    ) {
      await handleDashboardModal(interaction);
      return;
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("tsetup_modal_")
    ) {
      await handleTicketInteraction(interaction);
      return;
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("tkt_")
    ) {
      await handleTicketInteraction(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("pvc_")) {
        await handlePersonalVCButton(interaction);
        return;
      }

      if (interaction.customId === "refresh_stats") {
        try {
          await interaction.deferUpdate();
        } catch {}
        await updateStatusMessage(interaction.client);
        return;
      }

      if (interaction.customId === "status_whatsapp") {
        if (!config.whatsappUrl) {
          return await interaction.reply(
            eReply(
              `${i("ERROR")} ɴᴏᴛ sᴇᴛ`,
              "ᴡʜᴀᴛsᴀᴘᴘ ʟɪɴᴋ ʜᴀs ɴᴏᴛ ʙᴇᴇɴ ᴄᴏɴғɪɢᴜʀᴇᴅ.",
            ),
          );
        }
        return await interaction.reply(
          eReply(
            "ᴡʜᴀᴛsᴀᴘᴘ",
            `[ᴊᴏɪɴ ᴏᴜʀ ᴡʜᴀᴛsᴀᴘᴘ ɢʀᴏᴜᴘ](${config.whatsappUrl})`,
          ),
        );
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
      if (interaction.customId.startsWith("shantha_")) {
        await handleDashboardSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith("tsetup_")) {
        await handleTicketInteraction(interaction);
        return;
      }
    }

    if (interaction.isButton()) {
      if (
        interaction.customId.startsWith("approve_") ||
        interaction.customId.startsWith("reject_")
      ) {
        await handleApprovalAction(interaction);
        return;
      }

      if (interaction.customId.startsWith("ebld_")) {
        await handleEmbedBuilderInteraction(interaction);
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("ebld_")) {
        await handleEmbedBuilderInteraction(interaction);
        return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith("pvc_")) {
        await handlePersonalVCSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith("shantha_")) {
        await handleDashboardSelect(interaction);
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`,
      );
      return;
    }

    await command.execute(interaction);
  } catch (error) {
    console.error(
      `[ERROR] Unhandled error in interaction ${interaction.customId || interaction.commandName}:`,
      error,
    );
    const errorMessage = eReply(
      `${i("ERROR")} ᴇʀʀᴏʀ`,
      "ᴀɴ ᴜɴᴇxᴘᴇᴄᴛᴇᴅ ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ ᴘʀᴏᴄᴇssɪɴɢ ᴛʜɪs ɪɴᴛᴇʀᴀᴄᴛɪᴏɴ.",
    );
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage).catch(() => {});
      } else {
        await interaction.reply(errorMessage).catch(() => {});
      }
    } catch (replyError) {
      console.error(
        "[ERROR] Failed to send error message to user:",
        replyError,
      );
    }
  }
});

import contextManager from "./agents/tools/context-manager.js";

/**
 * Gracefully shuts down the bot, ensuring all conversation contexts are saved.
 * @param {string} signal - The shutdown signal received.
 */
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

process.on("unhandledRejection", (err) => {
  console.error("[ERROR] Unhandled rejection:", err?.message ?? err);
});

process.on("uncaughtException", (err) => {
  console.error("[ERROR] Uncaught exception:", err);
  contextManager
    .forceSaveAll()
    .catch(() => {})
    .finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
});

client.on("error", (err) => {
  console.error("[Discord Client Error]", err?.message ?? err);
});

client.login(config.token);

export default client;
