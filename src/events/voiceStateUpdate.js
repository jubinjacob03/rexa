import { Events } from "discord.js";
import {
  isPrivateVC,
  onMemberLeft,
  onMemberJoined,
} from "../utils/privateVCManager.js";
import {
  isTriggerChannel,
  isPersonalVC,
  createPersonalVC,
  onPersonalVCJoin,
  onPersonalVCLeave,
} from "../utils/personalVCManager.js";

export default {
  name: Events.VoiceStateUpdate,
  once: false,

  async execute(oldState, newState) {
    const guild = oldState.guild || newState.guild;

    if (newState.channelId && isTriggerChannel(newState.channelId)) {
      await createPersonalVC(newState.member, guild);
      return;
    }

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

    if (oldState.channelId && isPersonalVC(oldState.channelId)) {
      if (oldState.channelId !== newState.channelId) {
        onPersonalVCLeave(oldState.channelId, guild, oldState.member?.id);
      }
    }

    if (newState.channelId && isPersonalVC(newState.channelId)) {
      if (oldState.channelId !== newState.channelId) {
        onPersonalVCJoin(newState.channelId);
      }
    }
  },
};
