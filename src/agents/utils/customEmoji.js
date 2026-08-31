import { createRequire } from "module";

const require = createRequire(import.meta.url);
const EMOJI_MAP = require("../../utils/icon-map.json");

const EMOJI_NAMES = {};
export const UNICODE = {};
const resolved = {};

for (const [key, value] of Object.entries(EMOJI_MAP)) {
  EMOJI_NAMES[value.serverEmojiName] = key;
  UNICODE[key] = value.fallback;
  if (value.id) {
    const a = value.animated ? "a" : "";
    resolved[key] = {
      id: value.id,
      name: value.serverEmojiName,
      animated: value.animated || false,
      full: `<${a}:${value.serverEmojiName}:${value.id}>`,
    };
  }
}

export async function initEmojis(client) {
  try {
    const appEmojis = await client.application.emojis.fetch();
    for (const emoji of appEmojis.values()) {
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
  } catch {}
}

export function e(key) {
  if (resolved[key]) return resolved[key].full;
  return UNICODE[key] || "";
}

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

export function hasCustomEmojis() {
  return Object.keys(resolved).length > 0;
}
