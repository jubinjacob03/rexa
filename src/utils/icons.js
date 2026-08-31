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

export function icon(key) {
  if (resolved[key] !== undefined) return resolved[key];
  return iconMap[key]?.fallback ?? "";
}

export const i = (key) => `${icon(key)} `;
