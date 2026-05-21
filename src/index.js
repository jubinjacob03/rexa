import dotenv from "dotenv";
dotenv.config();

import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from "discord.js";
import { eReply, EMBED_COLOR, EPHEMERAL_COLOR, addFooter } from "./utils/embed.js";
import { i, icon } from "./utils/icons.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readdirSync, readFileSync } from "fs";
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

    if (interaction.customId === "status_roles_info") {
      const rolesPath = join(__dirname, "..", "data", "roles-info.json");
      let rolesData;
      try {
        rolesData = JSON.parse(readFileSync(rolesPath, "utf8"));
      } catch {
        return await interaction.reply(
          eReply(`${i("ERROR")} ᴇʀʀᴏʀ`, "ʀᴏʟᴇs ɪɴғᴏ ɴᴏᴛ ᴄᴏɴғɪɢᴜʀᴇᴅ."),
        );
      }

      const resolveEmoji = (value) =>
        (value ?? "").replace(/\{(\w+)\}/g, (match, key) => icon(key) || match);

      const container = new ContainerBuilder().setAccentColor(EPHEMERAL_COLOR);
      const title = rolesData.title || "Saiyan Gods — Roles";
      const guildIcon = interaction.guild.iconURL({ dynamic: true, size: 256 });
      const totalRoles = rolesData.sections.reduce(
        (sum, section) => sum + section.roles.length,
        0,
      );

      if (guildIcon) {
        const header = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## ${title}`),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              "\n• Staff roles are assigned by bot, leaders, or moderators.\n• Self roles can be assigned automatically via the verification channel.",
            ),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
        container.addSectionComponents(header);
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}`),
        );
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "**How Roles Work:**\n• Staff roles are assigned by bot, leaders, or moderators.\n• Self roles can be assigned automatically via the verification channel.",
          ),
        );
      }

      for (const section of rolesData.sections) {
        const sectionTitle = resolveEmoji(section.name);
        
        let roleLines = section.roles
          .map((r) => `${resolveEmoji(r.emoji)} **${r.name}** — ${r.description}`)
          .join("\n");

        container.addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small),
        );
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${sectionTitle}\n${roleLines}`
          ),
        );
      }

      addFooter(container);

      return await interaction.reply({
        components: [container],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
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
    if (interaction.customId === "shantha_private_vc_select") {
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

process.on("unhandledRejection", (err) => {
  console.error("[ERROR] Unhandled rejection:", err?.message ?? err);
});

client.login(config.token);

export default client;
