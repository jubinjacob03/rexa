import dotenv from "dotenv";
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
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
  handleSelfRoleToggle,
} from "./utils/verificationHandler.js";
import { handleTicketInteraction } from "./utils/ticketHandler.js";
import { buildStatusPayload } from "./commands/status.js";
import { postDashboard, handleDashboardInteraction, handleDashboardModal, handleDashboardSelect } from "./dashboard/dashboard.js";
import { handleRolesInfo } from "./utils/rolesEmbed.js";

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

import { loadCommands } from "./utils/commandLoader.js";
const loadedCommands = await loadCommands(undefined, {
  allowlist: ["setup-verification", "setup-ticket"],
});

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

client.once(Events.ClientReady, async () => {
  console.log(`[INFO] Logged in as ${client.user.tag}`);
  await postDashboard(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith("shantha_")) {
      await handleDashboardInteraction(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("shantha_")) {
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

    if (interaction.isModalSubmit() && interaction.customId.startsWith("tkt_")) {
      await handleTicketInteraction(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === "refresh_stats") {
        try {
          await interaction.deferUpdate();
        } catch {}
        await updateStatusMessage(interaction.client);
        return;
      }

      if (interaction.customId === "refresh_bot_status") {
        await interaction.update(
          await buildStatusPayload(interaction.client, interaction.guild),
        );
        return;
      }

      if (interaction.customId === "dismiss_roles_info") {
        await interaction.deferUpdate().catch(() => {});
        return await interaction.deleteReply().catch(() => {});
      }

      if (interaction.customId === "status_roles_info") {
        await handleRolesInfo(interaction);
        return;
      }

      if (interaction.customId.startsWith("dummy_role_")) {
        await interaction.deferUpdate().catch(() => {});
        return;
      }

      if (interaction.customId === "status_whatsapp") {
        const memberRoles = [
          config.memberRoleId,
          config.moderatorRoleId,
          config.managerRoleId,
          config.ownerRoleId,
        ].filter(Boolean);
        const hasAccess = interaction.member.roles.cache.some((r) =>
          memberRoles.includes(r.id),
        );
        if (!hasAccess) {
          return await interaction.reply(
            eReply(
              `${i("LOCK")} ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ`,
              "ᴛʜɪs ʟɪɴᴋ ɪs ᴏɴʟʏ ᴀᴠᴀɪʟᴀʙʟᴇ ᴛᴏ **ᴍᴇᴍʙᴇʀs** ᴀɴᴅ ᴀʙᴏᴠᴇ.",
            ),
          );
        }
        if (!config.whatsappUrl) {
          return await interaction.reply(
            eReply(
              `${i("ERROR")} ɴᴏᴛ sᴇᴛ`,
              "ᴡʜᴀᴛsᴀᴘᴘ ʟɪɴᴋ ʜᴀs ɴᴏᴛ ʙᴇᴇɴ ᴄᴏɴғɪɢᴜʀᴇᴅ.",
            ),
          );
        }
        return await interaction.reply(
          eReply("ᴡʜᴀᴛsᴀᴘᴘ", `[ᴊᴏɪɴ ᴏᴜʀ ᴡʜᴀᴛsᴀᴘᴘ ɢʀᴏᴜᴘ](${config.whatsappUrl})`),
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

      if (interaction.customId.startsWith("selfrole_")) {
        await handleSelfRoleToggle(interaction);
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
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "roles_nav_dropdown") {
        await handleRolesInfo(interaction, interaction.values[0]);
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    await command.execute(interaction);
  } catch (error) {
    console.error(`[ERROR] Unhandled error in interaction ${interaction.customId || interaction.commandName}:`, error);
    const errorMessage = eReply(
      `${i("ERROR")} ᴇʀʀᴏʀ`,
      "ᴀɴ ᴜɴᴇxᴘᴇᴄᴛᴇᴅ ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ ᴘʀᴏᴄᴇssɪɴɢ ᴛʜɪs ɪɴᴛᴇʀᴀᴄᴛɪᴏɴ."
    );
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage).catch(() => {});
      } else {
        await interaction.reply(errorMessage).catch(() => {});
      }
    } catch (replyError) {
      console.error("[ERROR] Failed to send error message to user:", replyError);
    }
  }
});

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

process.on("unhandledRejection", (err) => {
  console.error("[ERROR] Unhandled rejection:", err?.message ?? err);
});

process.on("uncaughtException", (err) => {
  console.error("[ERROR] Uncaught exception:", err?.message ?? err);
});

client.on("error", (err) => {
  console.error("[Discord Client Error]", err?.message ?? err);
});

client.login(config.token);

export default client;
