import config from "../../config.js";
import { PermissionFlagsBits } from "discord.js";

let client = null;

export function setupModerationTools(discordClient) {
  client = discordClient;
}

export async function checkModerationPermission(guild, userId, level) {
  if (!userId) return false;
  const member = await guild.members.fetch({ user: userId, force: false }).catch(() => null);
  if (!member) return false;

  const isServerOwner = member.id === guild.ownerId;
  const hasOwnerRole = member.roles.cache.has(config.ownerRoleId);
  const isOwner = isServerOwner || hasOwnerRole;

  if (level === "owner") return isOwner;

  if (level === "mod") {
    if (isOwner) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (config.managerRoleId && member.roles.cache.has(config.managerRoleId)) return true;
    if (config.moderatorRoleId && member.roles.cache.has(config.moderatorRoleId)) return true;
  }
  return false;
}

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

export function resolveRoleByName(guild, roleName) {
  const rq = (roleName || "").toLowerCase();
  if (!rq) return null;
  return guild.roles.cache.find((r) => r.name.toLowerCase().includes(rq));
}

// Ensure the bot does not moderate itself
function validateTarget(member) {
  if (!member) throw new Error("Target member not found in this server.");
  if (client && member.id === client.user.id) {
    throw new Error("I can't moderate myself.");
  }
}

export async function voiceMute(member, reason = "Requested via Shantha") {
  validateTarget(member);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setMute(true, reason);
  return `${member.displayName} has been server-muted in voice.`;
}

export async function voiceUnmute(member, reason = "Requested via Shantha") {
  validateTarget(member);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setMute(false, reason);
  return `${member.displayName} has been server-unmuted.`;
}

export async function voiceDeafen(member, reason = "Requested via Shantha") {
  validateTarget(member);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setDeaf(true, reason);
  return `${member.displayName} has been server-deafened.`;
}

export async function voiceUndeafen(member, reason = "Requested via Shantha") {
  validateTarget(member);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setDeaf(false, reason);
  return `${member.displayName} has been server-undeafened.`;
}

export async function timeout(member, durationMinutes = 5, reason = "Requested via Shantha") {
  validateTarget(member);
  const ms = Math.min(durationMinutes, 40320) * 60 * 1000;
  await member.timeout(ms, reason);
  return `${member.displayName} has been timed out for ${durationMinutes} minute(s).`;
}

export async function removeTimeout(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await member.timeout(null, reason);
  return `${member.displayName}'s timeout has been removed.`;
}

export async function kick(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await member.kick(reason);
  return `${member.displayName} has been kicked from the server.`;
}

export async function ban(member, deleteDays = 0, reason = "Requested via Shantha") {
  validateTarget(member);
  await member.ban({
    reason,
    deleteMessageSeconds: deleteDays * 86400,
  });
  return `${member.displayName} has been banned from the server.`;
}

export async function changeNickname(member, nickname, reason = "Requested via Shantha") {
  validateTarget(member);
  await member.setNickname(nickname ?? null, reason);
  return nickname
    ? `${member.displayName}'s nickname has been changed to "${nickname}".`
    : `${member.displayName}'s nickname has been reset.`;
}

export async function changeBotNickname(guild, nickname, reason = "Requested via Shantha") {
  const me = await guild.members.fetchMe();
  await me.setNickname(nickname ?? null, reason);
  return nickname
    ? `My nickname has been changed to "${nickname}".`
    : "My nickname has been reset.";
}

export async function addRole(guild, member, roleName, reason = "Requested via Shantha") {
  validateTarget(member);
  if (!roleName) throw new Error("roleName is required for add-role.");
  
  const role = resolveRoleByName(guild, roleName);
  if (!role) throw new Error(`Role "${roleName}" not found in this server.`);
  
  if (member.roles.cache.has(role.id)) {
    throw new Error(`${member.displayName} already has the "${role.name}" role.`);
  }
  
  await member.roles.add(role, reason);
  return `The "${role.name}" role has been added to ${member.displayName}.`;
}

export async function removeRole(guild, member, roleName, reason = "Requested via Shantha") {
  validateTarget(member);
  if (!roleName) throw new Error("roleName is required for remove-role.");
  
  const role = resolveRoleByName(guild, roleName);
  if (!role) throw new Error(`Role "${roleName}" not found in this server.`);
  
  if (!member.roles.cache.has(role.id)) {
    throw new Error(`${member.displayName} doesn't have the "${role.name}" role.`);
  }
  
  await member.roles.remove(role, reason);
  return `The "${role.name}" role has been removed from ${member.displayName}.`;
}