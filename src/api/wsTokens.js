import { randomBytes } from "crypto";

const TOKEN_TTL_MS = 30_000;

/** @type {Map<string, number>} */
const tokens = new Map();

/** Generate a single-use short-lived token for WS authentication. */
export function issueToken() {
  const token = randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

/**
 * Validates and consumes a token.
 * @param {string} token - The token to validate.
 * @returns {boolean} True if the token is valid and consumed, false otherwise.
 */
export function consumeToken(token) {
  const expiresAt = tokens.get(token);
  if (!expiresAt) return false;
  tokens.delete(token);
  return Date.now() < expiresAt;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of tokens) {
    if (now > expiresAt) tokens.delete(token);
  }
}, TOKEN_TTL_MS);
