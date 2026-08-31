import config from "../../config.js";
import { PermissionFlagsBits } from "discord.js";
import { BoundedMap } from "./resilience.js";

let client = null;

export function setupModerationTools(discordClient) {
  client = discordClient;
}

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
    if (
      config.administratorRoleId &&
      member.roles.cache.has(config.administratorRoleId)
    )
      return true;
    if (
      config.moderatorRoleId &&
      member.roles.cache.has(config.moderatorRoleId)
    )
      return true;
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

export async function voiceMute(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.MuteMembers);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setMute(true, reason);
  return `${member.displayName} has been server-muted in voice.`;
}

export async function voiceUnmute(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.MuteMembers);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setMute(false, reason);
  return `${member.displayName} has been server-unmuted.`;
}

export async function voiceDeafen(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.DeafenMembers);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setDeaf(true, reason);
  return `${member.displayName} has been server-deafened.`;
}

export async function voiceUndeafen(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.DeafenMembers);
  if (!member.voice?.channel) {
    throw new Error(`${member.displayName} is not in a voice channel.`);
  }
  await member.voice.setDeaf(false, reason);
  return `${member.displayName} has been server-undeafened.`;
}

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

export async function removeTimeout(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.ModerateMembers);
  await member.timeout(null, reason);
  return `${member.displayName}'s timeout has been removed.`;
}

export async function kick(member, reason = "Requested via Shantha") {
  validateTarget(member);
  await validateBotCanManageMember(member, PermissionFlagsBits.KickMembers);
  await member.kick(reason);
  return `${member.displayName} has been kicked from the server.`;
}

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

export async function unban(guild, userId, reason = "Requested via Shantha") {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.BanMembers)) {
    throw new Error("I don't have the Ban Members permission.");
  }
  const existingBan = await guild.bans.fetch(userId).catch(() => null);
  if (!existingBan) {
    throw new Error("That user is not banned.");
  }
  await guild.bans.remove(userId, reason);
  return `${existingBan.user?.tag ?? userId} has been unbanned.`;
}

export function isOwnerActor(actor) {
  if (!actor) return false;
  return (
    actor.id === actor.guild.ownerId ||
    (config.ownerRoleId && actor.roles.cache.has(config.ownerRoleId))
  );
}

export function checkActorCanModerateTarget(actor, target) {
  if (!actor || !target) {
    return { ok: false, reason: "Invalid moderator or target." };
  }
  if (actor.id === target.id) {
    return { ok: false, reason: "You can't moderate yourself." };
  }
  if (target.id === target.guild.ownerId) {
    return { ok: false, reason: "The server owner can't be moderated." };
  }
  if (isOwnerActor(actor)) return { ok: true };
  if (target.roles.highest.comparePositionTo(actor.roles.highest) >= 0) {
    return {
      ok: false,
      reason:
        "You can't moderate a member whose top role is equal to or higher than yours.",
    };
  }
  return { ok: true };
}

const MOD_ACTION_LIMIT = 8;
const MOD_ACTION_WINDOW_MS = 60 * 1000;
const _actorActionLog = new BoundedMap({
  maxSize: 2000,
  ttlMs: 5 * 60 * 1000,
});

export function checkModeratorCooldown(actor) {
  if (isOwnerActor(actor)) return { ok: true };
  const now = Date.now();
  const recent = (_actorActionLog.get(actor.id) || []).filter(
    (t) => now - t < MOD_ACTION_WINDOW_MS,
  );
  if (recent.length >= MOD_ACTION_LIMIT) {
    return { ok: false, retryMs: MOD_ACTION_WINDOW_MS - (now - recent[0]) };
  }
  recent.push(now);
  _actorActionLog.set(actor.id, recent);
  return { ok: true };
}
