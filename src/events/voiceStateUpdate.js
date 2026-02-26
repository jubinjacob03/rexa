import { Events } from "discord.js";
import {
  isPrivateVC,
  onMemberLeft,
  onMemberJoined,
} from "../utils/privateVCManager.js";

export default {
  name: Events.VoiceStateUpdate,
  once: false,

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
