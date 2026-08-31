import { randomBytes } from "crypto";

const TOKEN_TTL_MS = 30_000;

const tokens = new Map();

export function issueToken() {
  const token = randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

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
}, TOKEN_TTL_MS).unref();
