/**
 * Voice connection timeouts
 */
export const INACTIVITY_TIMEOUT = 5 * 60 * 1000;export const DISCONNECT_TIMEOUT = 5000;export const RECONNECT_TIMEOUT = 5000;
/**
 * Audio player configuration
 */
export const AUDIO_CONFIG = {
  MAX_QUEUE_SIZE: 50,
  DEFAULT_VOLUME: 0.5,
  IDLE_CHECK_INTERVAL: 30000,};

/**
 * Voice connection statuses
 */
export const ConnectionStatus = {
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTING: "disconnecting",
  DISCONNECTED: "disconnected",
  RECONNECTING: "reconnecting",
};

/**
 * Audio player statuses
 */
export const PlayerStatus = {
  IDLE: "idle",
  PLAYING: "playing",
  PAUSED: "paused",
  BUFFERING: "buffering",
};
