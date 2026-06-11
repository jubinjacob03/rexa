import config from "../../config.js";
import { PermissionFlagsBits } from "discord.js";

let client = null;

/**
 * Sets up the moderation tools with the Discord client.
 * @param {import('discord.js').Client} discordClient - The Discord client instance.
 */
export function setupModerationTools(discordClient) {
  client = discordClient;
}

/**
 * Checks if a user has a specific moderation permission level.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @param {string} userId - The ID of the user to check.
 * @param {string} level - The required permission level ('owner' or 'mod').
 * @returns {Promise<boolean>} True if the user has the required permission, false otherwise.
 */
export async function checkModerationPermission(guild, userId, level) {
  if (!userId) return false;
  const member = await guild.members
    .fetch({ user: userId, force: false })
    .catch(() => null);
  if (!member) return false;

  const isServerOwner = member.id === guild.ownerId;
  const hasOwnerRole = member.roles.cache.has(config.ownerRoleId);
  const isOwner = isServerOwner || hasOwnerRole;

  if (level === "owner") return isOwner;

  if (level === "mod") {
    if (isOwner) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (config.administratorRoleId && member.roles.cache.has(config.administratorRoleId))
      return true;
    if (
      config.moderatorRoleId &&
      member.roles.cache.has(config.moderatorRoleId)
    )
      return true;
  }
  return false;
}

/**
 * Resolves a guild member by their name, nickname, or display name.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @param {string} targetName - The name to search for.
 * @returns {import('discord.js').GuildMember|undefined} The resolved member, or undefined if not found.
 */
export function resolveMemberByName(guild, targetName) {
  const q = (targetName || "").toLowerCase();
  if (!q) return null;
  return guild.members.cache.find(
    (m) =>
      !m.user.bot &&
      (m.displayName.toLowerCase().includes(q) ||
        m.user.username.toLowerCase().includes(q) ||
        (m.nickname && m.nickname.toLowerCase().includes(q))),
  );
}

/**
 * Resolves a role by its name.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @param {string} roleName - The name of the role to search for.
 * @returns {import('discord.js').Role|undefined} The resolved role, or undefined if not found.
 */
export function resolveRoleByName(guild, roleName) {
  const rq = (roleName || "").toLowerCase();
  if (!rq) return null;
  return guild.roles.cache.find((r) => r.name.toLowerCase().includes(rq));
}

/**
 * Validates that the target member is valid and not the bot itself.
 * @param {import('discord.js').GuildMember} member - The target member.
 * @throws {Error} If the member is invalid or is the bot.
 */
function validateTarget(member) {
  if (!member) throw new Error("Target member not found in this server.");
  if (client && member.id === client.user.id) {
    throw new Error("I can't moderate myself.");
  }
}

async function validateBotCanManageMember(member, permission) {
  const me = member.guild.members.me ?? (await member.guild.members.fetchMe());
  if (!me.permissions.has(permission)) {
    throw new Error(
      "I don't have the required Discord permission for this action.",
    );
  }
  if (member.id === member.guild.ownerId) {
    throw new Error("I can't moderate the server owner.");
  }
  if (member.roles.highest.comparePositionTo(me.roles.highest) >= 0) {
    throw new Error(
      "I can't manage this member because their role is higher than or equal to mine.",
    );
  }
}

async function validateBotCanManageRole(guild, role) {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("I don't have the Manage Roles permission.");
  }
  if (role.managed) {
    throw new Error(`The "${role.name}" role is managed by an integration.`);
  }
  if (role.comparePositionTo(me.roles.highest) >= 0) {
    throw new Error(
      `I can't manage the "${role.name}" role because it is higher than or equal to mine.`,
    );
  }
}

/**
 * Server-mutes a member in voice channels.
 * @param {import('discord.js').GuildMember} member - The member to mute.
 * @param {string} [reason="Requested via Shantha"] - The reason for muting.
 * @returns {Promise<string>} A success message.
 */
export async function voiceMute(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.MuteMembers);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setMute(true, reason);
  return `${member.displayName} has been server-muted in voice.`;
}

/**
 * Server-unmutes a member in voice channels.
 * @param {import('discord.js').GuildMember} member - The member to unmute.
 * @param {string} [reason="Requested via Shantha"] - The reason for unmuting.
 * @returns {Promise<string>} A success message.
 */
export async function voiceUnmute(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.MuteMembers);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setMute(false, reason);
  return `${member.displayName} has been server-unmuted.`;
}

/**
 * Server-deafens a member in voice channels.
 * @param {import('discord.js').GuildMember} member - The member to deafen.
 * @param {string} [reason="Requested via Shantha"] - The reason for deafening.
 * @returns {Promise<string>} A success message.
 */
export async function voiceDeafen(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.DeafenMembers);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setDeaf(true, reason);
  return `${member.displayName} has been server-deafened.`;
}

/**
 * Server-undeafens a member in voice channels.
 * @param {import('discord.js').GuildMember} member - The member to undeafen.
 * @param {string} [reason="Requested via Shantha"] - The reason for undeafening.
 * @returns {Promise<string>} A success message.
 */
export async function voiceUndeafen(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.DeafenMembers);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setDeaf(false, reason);
  return `${member.displayName} has been server-undeafened.`;
}

/**
 * Times out a member.
 * @param {import('discord.js').GuildMember} member - The member to timeout.
 * @param {number} [durationMinutes=5] - The duration of the timeout in minutes.
 * @param {string} [reason="Requested via Shantha"] - The reason for the timeout.
 * @returns {Promise<string>} A success message.
 */
export async function timeout(
  member,
  durationMinutes = 5,
  reason = "Requested via Shantha",
) {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.ModerateMembers);
  const ms = Math.min(durationMinutes, 40320) * 60 * 1000;
  await member.timeout(ms, reason);
  return `${member.displayName} has been timed out for ${Math.round(ms / 60000)} minute(s).`;
}

/**
 * Removes a timeout from a member.
 * @param {import('discord.js').GuildMember} member - The member to remove the timeout from.
 * @param {string} [reason="Requested via Shantha"] - The reason for removing the timeout.
 * @returns {Promise<string>} A success message.
 */
export async function removeTimeout(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.ModerateMembers);
  await member.timeout(null, reason);
  return `${member.displayName}'s timeout has been removed.`;
}

/**
 * Kicks a member from the server.
 * @param {import('discord.js').GuildMember} member - The member to kick.
 * @param {string} [reason="Requested via Shantha"] - The reason for kicking.
 * @returns {Promise<string>} A success message.
 */
export async function kick(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.KickMembers);
  await member.kick(reason);
  return `${member.displayName} has been kicked from the server.`;
}

/**
 * Bans a member from the server.
 * @param {import('discord.js').GuildMember} member - The member to ban.
 * @param {number} [deleteDays=0] - The number of days of messages to delete.
 * @param {string} [reason="Requested via Shantha"] - The reason for banning.
 * @returns {Promise<string>} A success message.
 */
export async function ban(
  member,
  deleteDays = 0,
  reason = "Requested via Shantha",
) {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.BanMembers);
  await member.ban({
    reason,
    deleteMessageSeconds: deleteDays * 86400,
  });
  return `${member.displayName} has been banned from the server.`;
}

/**
 * Changes a member's nickname.
 * @param {import('discord.js').GuildMember} member - The member whose nickname to change.
 * @param {string|null} nickname - The new nickname, or null to reset.
 * @param {string} [reason="Requested via Shantha"] - The reason for changing the nickname.
 * @returns {Promise<string>} A success message.
 */
export async function changeNickname(
  member,
  nickname,
  reason = "Requested via Shantha",
) {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.ManageNicknames);
  await member.setNickname(nickname ?? null, reason);
  return nickname
    ? `${member.displayName}'s nickname has been changed to "${nickname}".`
    : `${member.displayName}'s nickname has been reset.`;
}

/**
 * Changes the bot's nickname in the server.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @param {string|null} nickname - The new nickname, or null to reset.
 * @param {string} [reason="Requested via Shantha"] - The reason for changing the nickname.
 * @returns {Promise<string>} A success message.
 */
export async function changeBotNickname(
  guild,
  nickname,
  reason = "Requested via Shantha",
) {
  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
    throw new Error("I don't have the Manage Nicknames permission.");
  }
  await me.setNickname(nickname ?? null, reason);
  return nickname
    ? `My nickname has been changed to "${nickname}".`
    : "My nickname has been reset.";
}

/**
 * Adds a role to a member.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @param {import('discord.js').GuildMember} member - The member to add the role to.
 * @param {string} roleName - The name of the role to add.
 * @param {string} [reason="Requested via Shantha"] - The reason for adding the role.
 * @returns {Promise<string>} A success message.
 */
export async function addRole(
  guild,
  member,
  roleName,
  reason = "Requested via Shantha",
) {
  validateTarget(member);
  if (!roleName) throw new Error("roleName is required for add-role.");

  const role = resolveRoleByName(guild, roleName);
  if (!role) throw new Error(`Role "${roleName}" not found in this server.`);
  await validateBotCanManageRole(guild, role);
  await validateBotCanManageMember(member, PermissionFlagsBits.ManageRoles);

  if (member.roles.cache.has(role.id)) {
    throw new Error(
      `${member.displayName} already has the "${role.name}" role.`,
    );
  }

  await member.roles.add(role, reason);
  return `The "${role.name}" role has been added to ${member.displayName}.`;
}

/**
 * Removes a role from a member.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @param {import('discord.js').GuildMember} member - The member to remove the role from.
 * @param {string} roleName - The name of the role to remove.
 * @param {string} [reason="Requested via Shantha"] - The reason for removing the role.
 * @returns {Promise<string>} A success message.
 */
export async function removeRole(
  guild,
  member,
  roleName,
  reason = "Requested via Shantha",
) {
  validateTarget(member);
  if (!roleName) throw new Error("roleName is required for remove-role.");

  const role = resolveRoleByName(guild, roleName);
  if (!role) throw new Error(`Role "${roleName}" not found in this server.`);
  await validateBotCanManageRole(guild, role);
  await validateBotCanManageMember(member, PermissionFlagsBits.ManageRoles);

  if (!member.roles.cache.has(role.id)) {
    throw new Error(
      `${member.displayName} doesn't have the "${role.name}" role.`,
    );
  }

  await member.roles.remove(role, reason);
  return `The "${role.name}" role has been removed from ${member.displayName}.`;
}
