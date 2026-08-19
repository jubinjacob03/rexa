import iconMap from "./icon-map.json" with { type: "json" };

const resolved = {};

for (const [key, entry] of Object.entries(iconMap)) {
  if (key.startsWith("_")) continue;
  if (entry.id) {
    const a = entry.animated ? "a" : "";
    resolved[key] = `<${a}:${entry.serverEmojiName}:${entry.id}>`;
  } else {
    resolved[key] = entry.fallback;
  }
}

export async function initIcons(client) {
  try {
    const appEmojis = await client.application.emojis.fetch();
    for (const [key, entry] of Object.entries(iconMap)) {
      if (key.startsWith("_")) continue;
      const emoji = appEmojis.find((e) => e.name === entry.serverEmojiName);
      if (emoji) {
        resolved[key] =
          `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
      }
    }
    console.log(`[ICONS] Refreshed from ${appEmojis.size} app emojis`);
  } catch {
    console.log(`[ICONS] Using hardcoded IDs`);
  }

  const total = Object.keys(iconMap).filter((k) => !k.startsWith("_")).length;
  const loaded = Object.entries(resolved).filter(([, v]) =>
    v.startsWith("<"),
  ).length;
  console.log(`[ICONS] ${loaded}/${total} custom icons ready`);
}

/**
 * Get an icon string by key.
 * Returns the resolved custom emoji if loaded, otherwise the unicode fallback.
 * @param {string} key - Icon key e.g. "SUCCESS", "ERROR", "TICKET"
 * @returns {string}
 */
export function icon(key) {
  if (resolved[key] !== undefined) return resolved[key];
  return iconMap[key]?.fallback ?? "";
}

/**
 * Convenience: icon(key) + " " — handy for embed titles.
 * e.g.  `${i("SUCCESS")}Done` → "✅ Done"
 * @param {string} key
 * @returns {string}
 */
export const i = (key) => `${icon(key)} `;
