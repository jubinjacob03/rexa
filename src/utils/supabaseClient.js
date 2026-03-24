import { createClient } from "@supabase/supabase-js";
import config from "../../config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Fetch sound metadata from database
 */
export async function getSoundById(soundId) {
  try {
    const { data, error } = await supabase
      .from("sounds")
      .select("*")
      .eq("id", soundId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("[ERROR] Failed to fetch sound:", error);
    return null;
  }
}

/**
 * Log playback event to database
 */
export async function logPlayback(
  soundId,
  guildId,
  channelId,
  channelName,
  userId,
  username,
) {
  try {
    const { error } = await supabase.from("playback_history").insert({
      sound_id: soundId,
      guild_id: guildId,
      channel_id: channelId,
      channel_name: channelName || null,
      user_id: userId,
      discord_username: username,
    });

    if (error) throw error;
    await supabase.rpc("increment_play_count", { sound_uuid: soundId });

    console.log(`[INFO] Logged playback for sound ${soundId}`);
  } catch (error) {
    console.error("[ERROR] Failed to log playback:", error);
  }
}

/**
 * Get all sounds from database
 */
export async function getAllSounds(limit = 100, offset = 0) {
  try {
    const { data, error } = await supabase
      .from("sounds")
      .select("*")
      .eq("is_public", true)
      .order("play_count", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("[ERROR] Failed to fetch sounds:", error);
    return [];
  }
}

export default supabase;
