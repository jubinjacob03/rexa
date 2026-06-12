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

const ROLES_INFO_PATH = join(__dirname, "..", "..", "data", "roles-info.json");
const ROLES_CACHE_TTL = 5 * 60 * 1000;
let _rolesCache = null;
let _rolesCacheAt = 0;

/**
 * Loads and caches roles-info.json, re-reading from disk at most once per TTL.
 * @returns {Promise<object|null>} Parsed roles data, or null if unreadable.
 */
async function loadRolesData() {
  if (_rolesCache && Date.now() - _rolesCacheAt < ROLES_CACHE_TTL) {
    return _rolesCache;
  }
  try {
    _rolesCache = JSON.parse(await readFile(ROLES_INFO_PATH, "utf8"));
    _rolesCacheAt = Date.now();
  } catch {
    _rolesCache = null;
  }
  return _rolesCache;
}

/**
 * Handles the roles info interaction.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @param {string} [selectedCategory="home"] - The selected category.
 * @returns {Promise<void>}
 */
export async function handleRolesInfo(interaction, selectedCategory = "home") {
  const rolesData = await loadRolesData();

  if (!rolesData) {
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

      const buttons = section.roles.map((r, rIdx) => {
        const selfAssignable = section.selfAssignable && r.id;
        return new ButtonBuilder()
          .setCustomId(
            selfAssignable
              ? `selfrole_toggle_${r.id}`
              : `dummy_role_${sectionIndex}_${rIdx}`,
          )
          .setLabel(r.name)
          .setEmoji(resolveEmoji(r.emoji))
          .setStyle(ButtonStyle.Secondary);
      });

      for (let start = 0; start < buttons.length; start += 5) {
        container.addActionRowComponents(
          new ActionRowBuilder().addComponents(buttons.slice(start, start + 5)),
        );
      }
    }
  }

  const navRow = new ActionRowBuilder();
  const homeEmoji = icon("HOME") || "🏠";
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("roles_nav_dropdown")
    .setPlaceholder("Select a category to explore...")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Home Hub")
        .setValue("home")
        .setDescription("Return to the roles overview")
        .setEmoji(homeEmoji)
        .setDefault(selectedCategory === "home"),
    );

  rolesData.sections.forEach((sec, idx) => {
    const emojiToken = sec.name.match(/\{(\w+)\}/)?.[1];
    const rawName = sec.name.replace(/\{(\w+)\}/g, "").trim();
    const cleanLabel = rawName || `Category ${idx + 1}`;

    const option = new StringSelectMenuOptionBuilder()
      .setLabel(cleanLabel)
      .setValue(idx.toString())
      .setDescription(`View all ${cleanLabel}`)
      .setDefault(selectedCategory === idx.toString());

    const resolvedEmoji = emojiToken ? icon(emojiToken) : null;
    if (resolvedEmoji) option.setEmoji(resolvedEmoji);

    selectMenu.addOptions(option);
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

/**
 * Builds a set of self-assignable role IDs (with labels) from roles-info.json.
 * @returns {Promise<Map<string, string>>} Map of roleId -> role label.
 */
async function getSelfAssignableRoles() {
  const map = new Map();
  const data = await loadRolesData();
  if (!data) return map;
  for (const section of data.sections ?? []) {
    if (!section.selfAssignable) continue;
    for (const role of section.roles ?? []) {
      if (role.id) map.set(role.id, role.name);
    }
  }
  return map;
}

/**
 * Handles a role button click from the interactive roles hub.
 * Self-assignable roles are toggled (add/remove); other roles return an
 * ephemeral notice that they cannot be self-assigned.
 * @param {import('discord.js').ButtonInteraction} interaction - The button interaction.
 * @returns {Promise<void>}
 */
export async function handleRoleButton(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith("dummy_role_")) {
    return interaction.reply(
      eReply(
        `${i("LOCK")} ɴᴏᴛ sᴇʟғ-ᴀssɪɢɴᴀʙʟᴇ`,
        "ᴛʜɪs ʀᴏʟᴇ ᴄᴀɴ'ᴛ ʙᴇ sᴇʟғ-ᴀssɪɢɴᴇᴅ.",
      ),
    );
  }

  if (!customId.startsWith("selfrole_toggle_")) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const roleId = customId.slice("selfrole_toggle_".length);
  const selfRoles = await getSelfAssignableRoles();
  const label = selfRoles.get(roleId);

  if (!label) {
    return interaction.editReply(
      eReply(
        `${i("LOCK")} ɴᴏᴛ sᴇʟғ-ᴀssɪɢɴᴀʙʟᴇ`,
        "ᴛʜɪs ʀᴏʟᴇ ᴄᴀɴ'ᴛ ʙᴇ sᴇʟғ-ᴀssɪɢɴᴇᴅ.",
      ),
    );
  }

  const guild = interaction.guild;
  const member = await guild?.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (!member) {
    return interaction.editReply(
      eReply(`${i("ERROR")} ᴇʀʀᴏʀ`, "ᴄᴏᴜʟᴅ ɴᴏᴛ ʀᴇsᴏʟᴠᴇ ʏᴏᴜʀ ᴍᴇᴍʙᴇʀ ᴅᴀᴛᴀ."),
    );
  }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    return interaction.editReply(
      eReply(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "ᴛʜᴀᴛ ʀᴏʟᴇ ɴᴏ ʟᴏɴɢᴇʀ ᴇxɪsᴛs."),
    );
  }

  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      return interaction.editReply(
        eReply(
          `${i("DONE")} ʀᴏʟᴇ ʀᴇᴍᴏᴠᴇᴅ`,
          `ʀᴇᴍᴏᴠᴇᴅ **${label}** ғʀᴏᴍ ʏᴏᴜʀ ʀᴏʟᴇs.`,
        ),
      );
    }
    await member.roles.add(roleId);
    return interaction.editReply(
      eReply(
        `${i("DONE")} ʀᴏʟᴇ ᴀᴅᴅᴇᴅ`,
        `ᴀssɪɢɴᴇᴅ **${label}** ᴛᴏ ʏᴏᴜʀ ʀᴏʟᴇs.`,
      ),
    );
  } catch {
    return interaction.editReply(
      eReply(
        `${i("ERROR")} ᴇʀʀᴏʀ`,
        "ғᴀɪʟᴇᴅ ᴛᴏ ᴜᴘᴅᴀᴛᴇ ʏᴏᴜʀ ʀᴏʟᴇ. ᴍʏ ʀᴏʟᴇ ᴍᴀʏ ʙᴇ ᴛᴏᴏ ʟᴏᴡ ɪɴ ᴛʜᴇ ʜɪᴇʀᴀʀᴄʜʏ.",
      ),
    );
  }
}
