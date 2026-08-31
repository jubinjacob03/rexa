import { e } from "./customEmoji.js";

export const ACTION_ONLY_TOOLS = new Set([
  "executeCommand",
  "executeWorkflow",
  "createPrivateVC",
  "discordAction",
  "generateImage",
]);

export const MUSIC_INFO_ACTIONS = new Set(["nowplaying", "queue"]);

export function getMusicConfirmation(action) {
  const confirmations = {
    play: `${e("PLAY")} On it!`,
    pause: `${e("PAUSE")} Paused.`,
    resume: `${e("PLAY")} Resumed.`,
    skip: `${e("SKIP")} Skipped.`,
    stop: `${e("STOP")} Stopped.`,
    volume: `${e("VOLUP")} Volume updated.`,
  };
  return confirmations[action];
}
