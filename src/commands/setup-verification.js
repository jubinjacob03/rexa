import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import config from "../../config.js";
import {
  getAutoDmEnabled,
  setAutoDmEnabled,
  getAutoApprove,
  setAutoApprove,
} from "../utils/verificationHandler.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup-verification")
    .setDescription("Set up verification embeds in the verification channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName("auto")
        .setDescription(
          "Auto-DM new members with the verification embed when they join (default: off)",
        )
        .setRequired(false)
        .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" }),
    )
    .addStringOption((option) =>
      option
        .setName("approve")
        .setDescription(
          "auto: AI DM auto-grants role. manual: sends to #approvals for human review.",
        )
        .setRequired(false)
        .addChoices(
          { name: "auto", value: "auto" },
          { name: "manual", value: "manual" },
        ),
    ),

  async execute(interaction) {
    try {
      const autoOption = interaction.options.getString("auto");
      if (autoOption !== null) {
        const enabled = autoOption === "on";
        await setAutoDmEnabled(enabled);
      }
      const approveOption = interaction.options.getString("approve");
      if (approveOption !== null) {
        await setAutoApprove(approveOption === "auto");
      }
      const currentAutoDm = await getAutoDmEnabled();
      const currentAutoApprove = await getAutoApprove();

      const verificationChannel = await interaction.guild.channels.fetch(
        config.verificationChannelId,
      );

      if (!verificationChannel) {
        return interaction.reply({
          content: "❌ Verification channel not found!",
          flags: MessageFlags.Ephemeral,
        });
      }

      const verificationEmbed = new EmbedBuilder()
        .setColor("#00ddff")
        .setTitle("🔐 ʀᴏʟᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ")
        .setDescription("**ᴄʟɪᴄᴋ ᴏɴ ᴛʜᴇ ᴀᴘᴘʀᴏᴘʀɪᴀᴛᴇ ʀᴏʟᴇ ʏᴏᴜ ᴡᴀɴᴛ ᴛᴏ ᴀᴘᴘʟʏ.** ")
        .setTimestamp();

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("dev_check")
          .setLabel("ᴅᴇᴠ ᴄʜᴇᴄᴋ")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("verify_friends")
          .setLabel("ғʀɪᴇɴᴅs")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("verify_member")
          .setLabel("ɢᴜɪʟᴅ-ᴍᴇᴍʙᴇʀ")
          .setStyle(ButtonStyle.Success),
      );

      const messages = await verificationChannel.messages.fetch({ limit: 10 });
      let existingMessage = null;

      messages.forEach((msg) => {
        if (
          msg.author.id === interaction.client.user.id &&
          msg.embeds.length > 0
        ) {
          const embedTitle = msg.embeds[0].title;
          if (
            embedTitle?.includes("Role Verification") ||
            embedTitle?.includes("ғʀɪᴇɴᴅs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ") ||
            embedTitle?.includes("ᴍᴇᴍʙᴇʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ")
          ) {
            if (!existingMessage) existingMessage = msg;
          }
        }
      });

      if (existingMessage) {
        await existingMessage.edit({
          embeds: [verificationEmbed],
          components: [buttonRow],
        });
        console.log("[INFO] Updated existing verification embed");

        const oldMessages = messages.filter(
          (msg) =>
            msg.id !== existingMessage.id &&
            msg.author.id === interaction.client.user.id &&
            msg.embeds.length > 0 &&
            (msg.embeds[0].title?.includes("ғʀɪᴇɴᴅs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ") ||
              msg.embeds[0].title?.includes("ᴍᴇᴍʙᴇʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ")),
        );

        for (const msg of oldMessages.values()) {
          await msg.delete().catch(() => {});
          console.log("[INFO] Deleted old verification embed");
        }

        await interaction.reply({
          content: `✅ Verification embed updated successfully!\n📬 Auto-DM on join: **${currentAutoDm ? "on" : "off"}**\n🤖 Approve mode: **${currentAutoApprove ? "auto (AI DM)" : "manual (approvals channel)"}**`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await verificationChannel.send({
          embeds: [verificationEmbed],
          components: [buttonRow],
        });
        console.log("[INFO] Created new verification embed");
        await interaction.reply({
          content: `✅ Verification embed set up successfully!\n📬 Auto-DM on join: **${currentAutoDm ? "on" : "off"}**\n🤖 Approve mode: **${currentAutoApprove ? "auto (AI DM)" : "manual (approvals channel)"}**`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error("[ERROR] Error setting up verification:", error);
      await interaction.reply({
        content: "❌ Failed to set up verification embed.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
