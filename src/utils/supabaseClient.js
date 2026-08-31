import { createClient } from "@supabase/supabase-js";
import config from "../../config.js";
import { createLogger } from "./logger.js";
import { withRetry } from "./resilience.js";

const log = createLogger("supabase");

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function getSoundById(soundId) {
  try {
    return await withRetry(async () => {
      const { data, error } = await supabase
        .from("sounds")
        .select("*")
        .eq("id", soundId)
        .single();
      if (error) throw error;
      return data;
    });
  } catch (error) {
    log.error("Failed to fetch sound:", error);
    return null;
  }
}

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

    log.info(`Logged playback for sound ${soundId}`);
  } catch (error) {
    log.error("Failed to log playback:", error);
  }
}

export default supabase;
