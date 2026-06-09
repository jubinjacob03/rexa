import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from "discord.js";
import { readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { eReply, addFooter } from "./embed.js";
import { i, icon } from "./icons.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Handles the roles info interaction.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @param {string} [selectedCategory="home"] - The selected category.
 * @returns {Promise<void>}
 */
export async function handleRolesInfo(interaction, selectedCategory = "home") {
  const rolesPath = join(__dirname, "..", "..", "data", "roles-info.json");
  let rolesData = null;

  try {
    const fileContent = await readFile(rolesPath, "utf8");
    rolesData = JSON.parse(fileContent);
  } catch {
    const errPayload = eReply(
      `${i("ERROR")} ᴇʀʀᴏʀ`,
      "ʀᴏʟᴇs ɪɴғᴏ ɴᴏᴛ ᴄᴏɴғɪɢᴜʀᴇᴅ.",
    );
    return interaction.isStringSelectMenu()
      ? await interaction.update(errPayload)
      : await interaction.reply(errPayload);
  }

  const resolveEmoji = (value) =>
    (value ?? "").replace(/\{(\w+)\}/g, (match, key) => icon(key) || match);

  const container = new ContainerBuilder().setAccentColor(0x00ffff);
  const title = rolesData.title || "Saiyan Gods — Roles";
  const guildIcon = interaction.guild.iconURL({ dynamic: true, size: 256 });

  if (selectedCategory === "home") {
    if (guildIcon) {
      const header = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${title}`),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "Welcome to the interactive roles hub.\n\n• **Staff roles** are assigned by leaders or moderators.\n• **Self roles** can be assigned automatically via the verification channel.\n\n*Use the dropdown below to explore the role categories.*",
          ),
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));
      container.addSectionComponents(header);
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ${title}\nWelcome to the interactive roles hub.\n\n• **Staff roles** are assigned by leaders or moderators.\n• **Self roles** can be assigned automatically via the verification channel.\n\n*Use the dropdown below to explore the role categories.*`,
        ),
      );
    }
  } else {
    const sectionIndex = parseInt(selectedCategory, 10);
    const section = rolesData.sections[sectionIndex];
    if (section) {
      const sectionTitle = resolveEmoji(section.name);

      const descriptions = section.roles
        .map((r) => `-# **${r.name}**: ${r.description}`)
        .join("\n");

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${sectionTitle}\n${descriptions}\n`,
        ),
      );

      const row = new ActionRowBuilder();
      section.roles.forEach((r, rIdx) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dummy_role_${sectionIndex}_${rIdx}`)
            .setLabel(r.name)
            .setEmoji(resolveEmoji(r.emoji))
            .setStyle(ButtonStyle.Secondary),
        );
      });
      container.addActionRowComponents(row);
    }
  }

  const navRow = new ActionRowBuilder();
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("roles_nav_dropdown")
    .setPlaceholder("Select a category to explore...")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Home Hub")
        .setValue("home")
        .setDescription("Return to the roles overview")
        .setEmoji("🏠")
        .setDefault(selectedCategory === "home"),
    );

  rolesData.sections.forEach((sec, idx) => {
    const rawName = sec.name.replace(/\{(\w+)\}/g, "").trim();
    const cleanLabel = rawName || `Category ${idx + 1}`;

    selectMenu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(cleanLabel)
        .setValue(idx.toString())
        .setDescription(`View all ${cleanLabel}`)
        .setDefault(selectedCategory === idx.toString()),
    );
  });
  navRow.addComponents(selectMenu);

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Large),
  );
  container.addActionRowComponents(navRow);

  addFooter(container);

  const payload = {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };

  if (interaction.isStringSelectMenu()) {
    return await interaction.update(payload);
  } else {
    return await interaction.reply(payload);
  }
}
