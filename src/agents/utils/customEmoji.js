/**
 * @file customEmoji.js
 * @description Custom emoji utilities for Shantha Discord bot. Loads custom emojis from Discord server and provides fallback to unicode. Based on the Zyra/Remani implementation.
 */

import path from "path";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const EMOJI_MAP = require("../../utils/icon-map.json");

/** Maps Discord emoji names to internal keys */
const EMOJI_NAMES = {};

/** Unicode fallbacks when custom emojis aren't available */
export const UNICODE = {};

for (const [key, value] of Object.entries(EMOJI_MAP)) {
  EMOJI_NAMES[value.serverEmojiName] = key;
  UNICODE[key] = value.fallback;
}

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
