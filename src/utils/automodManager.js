import { createClient } from "@supabase/supabase-js";
import config from "../../config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GUILD_ID = config.guildId;

const defaultData = {
  enabled: false,
  spam: true,
  raid: true,
  toxicity: true,
  limits: {
    messageSpam: 5,
    channelDelete: 2,
    nicknameChange: 3,
    messageDelete: 3,
  },
};

// In-memory cache — avoids a DB round-trip on every single message event
let _cache = null;
let _cacheTTL = 0;
const CACHE_MS = 10_000; // 10 seconds

export async function loadConfig() {
  if (_cache && Date.now() < _cacheTTL) return _cache;

  try {
    const { data, error } = await supabase
      .from("bot_automod")
      .select("*")
      .eq("guild_id", GUILD_ID)
      .single();

    if (error || !data) {
      // Row doesn't exist yet — create it with defaults
      await supabase.from("bot_automod").upsert({
        guild_id: GUILD_ID,
        ...defaultData,
        updated_at: new Date().toISOString(),
      });
      _cache = { ...defaultData };
    } else {
      _cache = {
        enabled: data.enabled,
        spam: data.spam,
        raid: data.raid,
        toxicity: data.toxicity,
        limits: { ...defaultData.limits, ...(data.limits || {}) },
      };
    }

    _cacheTTL = Date.now() + CACHE_MS;
    return _cache;
  } catch (error) {
    console.error("[ERROR] Failed to load automod config:", error);
    return _cache || { ...defaultData };
  }
}

export async function saveConfig(data) {
  try {
    const { error } = await supabase.from("bot_automod").upsert({
      guild_id: GUILD_ID,
      enabled: data.enabled,
      spam: data.spam,
      raid: data.raid,
      toxicity: data.toxicity,
      limits: data.limits,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;

    // Bust cache so next read reflects the change immediately
    _cache = { ...data };
    _cacheTTL = Date.now() + CACHE_MS;
  } catch (error) {
    console.error("[ERROR] Failed to save automod config:", error);
  }
}

export async function updateConfig(updates) {
  const current = await loadConfig();
  const newData = {
    ...current,
    ...updates,
    limits: { ...current.limits, ...(updates.limits || {}) },
  };
  await saveConfig(newData);
  return newData;
}
