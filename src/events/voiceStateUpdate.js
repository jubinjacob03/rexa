import { Events } from "discord.js";
import {
  isPrivateVC,
  onMemberLeft,
  onMemberJoined,
} from "../utils/privateVCManager.js";

/**
 * Handles the VoiceStateUpdate event.
 * @module events/voiceStateUpdate
 */
export default {
  name: Events.VoiceStateUpdate,
  once: false,

  /**
   * Executes the event handler.
   * @param {import("discord.js").VoiceState} oldState - The voice state before the update.
   * @param {import("discord.js").VoiceState} newState - The voice state after the update.
   * @returns {Promise<void>}
   */
  async execute(oldState, newState) {
    const guild = oldState.guild || newState.guild;

    if (oldState.channelId && isPrivateVC(oldState.channelId)) {
      if (oldState.channelId !== newState.channelId) {
        onMemberLeft(oldState.channelId, guild);
      }
    }

    if (newState.channelId && isPrivateVC(newState.channelId)) {
      if (oldState.channelId !== newState.channelId) {
        onMemberJoined(newState.channelId);
      }
    }
  },
};
