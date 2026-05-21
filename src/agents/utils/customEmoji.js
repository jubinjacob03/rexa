/**
 * @file customEmoji.js
 * @description Custom emoji utilities for Shantha Discord bot. Loads custom emojis from Discord server and provides fallback to unicode. Based on the Zyra/Remani implementation.
 */

/** Maps Discord emoji names to internal keys */
const EMOJI_NAMES = {
  r_play: "PLAY",
  r_pause: "PAUSE",
  r_stop: "STOP",
  r_skip: "SKIP",
  r_previous: "PREVIOUS",
  r_shuffle: "SHUFFLE",
  r_loop: "LOOP",
  r_loopone: "LOOP_ONE",
  r_volup: "VOLUP",
  r_voldown: "VOLDOWN",
  r_queue: "QUEUE",
  r_music: "MUSIC",
  r_headphones: "HEADPHONES",
  r_author: "AUTHOR",
  r_playlist: "PLAYLIST",
  r_youtube: "YOUTUBE",
  r_spotify: "SPOTIFY",
  r_success: "SUCCESS",
  r_error: "ERROR",
  r_warning: "WARNING",
  r_info: "INFO",
  r_refresh: "REFRESH",
  r_user: "USER",
  r_time: "TIME",
};

/** Unicode fallbacks when custom emojis aren't available */
export const UNICODE = {
  PLAY: "▶️",
  PAUSE: "⏸️",
  STOP: "⏹️",
  SKIP: "⏭️",
  PREVIOUS: "⏮️",
  SHUFFLE: "🔀",
  LOOP: "🔁",
  LOOP_ONE: "🔂",
  VOLUP: "🔊",
  VOLDOWN: "🔉",
  QUEUE: "📋",
  MUSIC: "🎵",
  HEADPHONES: "🎧",
  AUTHOR: "🎤",
  PLAYLIST: "📑",
  YOUTUBE: "🔴",
  SPOTIFY: "🟢",
  SUCCESS: "✅",
  ERROR: "❌",
  WARNING: "⚠️",
  INFO: "ℹ️",
  REFRESH: "🔄",
  USER: "👤",
  TIME: "⏱️",
};

/** Resolved custom emojis from Discord server */
const resolved = {};

/**
 * Initialize custom emojis from Discord client.
 * Call this once after the client is ready.
 * @param {import('discord.js').Client} client
 */
export function initEmojis(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const emoji of guild.emojis.cache.values()) {
      const key = EMOJI_NAMES[emoji.name];
      if (key) {
        resolved[key] = {
          id: emoji.id,
          name: emoji.name,
          animated: emoji.animated,
          full: `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`,
        };
      }
    }
  }
  const count = Object.keys(resolved).length;
  if (count > 0) console.log(`[EMOJI] ✅ Loaded ${count} custom emojis`);
  else console.log(`[EMOJI] No custom emojis found, using unicode fallbacks`);
}

/**
 * Get emoji string by key. Returns custom emoji if available, unicode fallback otherwise.
 * @param {string} key - Emoji key (e.g., "PLAY", "PAUSE", "SUCCESS")
 * @returns {string} Emoji string
 */
export function e(key) {
  if (resolved[key]) return resolved[key].full;
  return UNICODE[key] || "";
}

/**
 * Get emoji object for button components.
 * @param {string} key - Emoji key
 * @returns {{ id: string, name: string, animated: boolean } | string}
 */
export function btn(key) {
  if (resolved[key]) {
    return {
      id: resolved[key].id,
      name: resolved[key].name,
      animated: resolved[key].animated,
    };
  }
  return UNICODE[key] || "❓";
}

/**
 * Check if custom emojis are loaded.
 * @returns {boolean}
 */
export function hasCustomEmojis() {
  return Object.keys(resolved).length > 0;
}
