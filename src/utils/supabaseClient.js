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
 * Logs a playback event to the database.
 * @param {string} soundId - The ID of the sound.
 * @param {string} guildId - The ID of the guild.
 * @param {string} channelId - The ID of the channel.
 * @param {string|null} channelName - The name of the channel.
 * @param {string} userId - The ID of the user.
 * @param {string} username - The username of the user.
 * @returns {Promise<void>}
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
 * Gets all public sounds from the database.
 * @param {number} [limit=100] - The maximum number of sounds to fetch.
 * @param {number} [offset=0] - The offset for pagination.
 * @returns {Promise<Array>} An array of sound objects.
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
