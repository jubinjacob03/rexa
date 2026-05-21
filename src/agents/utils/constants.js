/**
 * @file constants.js
 * @description Agent-related constants for tool handling and response generation.
 */

import { e } from "./customEmoji.js";

/** Tools that only perform actions and return a confirmation (no synthesis pass needed) */
export const ACTION_ONLY_TOOLS = new Set([
  "executeCommand",
  "executeWorkflow",
  "createPrivateVC",
  "discordAction",
]);

/** Music actions that return info (need synthesis) vs pure actions */
export const MUSIC_INFO_ACTIONS = new Set(["nowplaying", "queue"]);

/**
 * Get quick confirmation message for music control actions (no synthesis needed).
 * Uses custom Discord emojis if available, falls back to unicode.
 * @param {string} action - Music action name
 * @returns {string | undefined}
 */
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
