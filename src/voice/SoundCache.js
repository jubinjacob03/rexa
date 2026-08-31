import { Readable } from "stream";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { readFile, writeFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { BoundedMap } from "../utils/resilience.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "../../cache/audio");
const MANIFEST_PATH = join(__dirname, "../../cache/manifest.json");

function ensureCacheDir() {
  mkdirSync(CACHE_DIR, { recursive: true });
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const SOUND_MEMORY_MAX = 40;

function assertSafeSoundUrl(soundUrl) {
  let parsed;
  try {
    parsed = new URL(soundUrl);
  } catch {
    throw new Error("SoundCache: invalid sound URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`SoundCache: unsupported URL scheme ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "::" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    (host.includes(":") &&
      (host.startsWith("fe80:") ||
        host.startsWith("fc") ||
        host.startsWith("fd")));
  if (isPrivate && process.env.NODE_ENV !== "development") {
    throw new Error(`SoundCache: blocked private host ${host}`);
  }
}

class SoundCache {
  constructor() {
    this.memory = new BoundedMap({ maxSize: SOUND_MEMORY_MAX });

    this.pending = new Map();

    ensureCacheDir();
    this.manifest = this._loadManifest();
  }

  async get(soundId, soundUrl, soundName = "") {
    if (this.memory.has(soundId)) return this.memory.get(soundId);
    if (this.pending.has(soundId)) return this.pending.get(soundId);

    const promise = this._resolve(soundId, soundUrl, soundName)
      .then((buf) => {
        this.pending.delete(soundId);
        return buf;
      })
      .catch((err) => {
        this.pending.delete(soundId);
        throw err;
      });

    this.pending.set(soundId, promise);
    return promise;
  }

  async _resolve(soundId, soundUrl, soundName) {
    const filePath = this._filePath(soundId);
    if (existsSync(filePath)) {
      const buf = await readFile(filePath);
      this.memory.set(soundId, buf);
      return buf;
    }
    return this._fetchAndStore(soundId, soundUrl, soundName);
  }

  async _fetchAndStore(soundId, soundUrl, soundName) {
    assertSafeSoundUrl(soundUrl);
    console.log(`[INFO] SoundCache: fetching ${soundName || soundId}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      let currentUrl = soundUrl;
      for (let hop = 0; ; hop += 1) {
        assertSafeSoundUrl(currentUrl);
        res = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: "manual",
        });
        if (![301, 302, 303, 307, 308].includes(res.status)) break;
        if (hop >= 5) throw new Error("SoundCache: too many redirects");
        const location = res.headers.get("location");
        if (!location) break;
        currentUrl = new URL(location, currentUrl).toString();
      }
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok)
      throw new Error(`SoundCache fetch failed: ${res.status} ${soundUrl}`);

    const declaredSize = Number(res.headers.get("content-length") || 0);
    if (declaredSize && declaredSize > MAX_AUDIO_BYTES) {
      throw new Error(`SoundCache: response too large (${declaredSize} bytes)`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_AUDIO_BYTES) {
      throw new Error(`SoundCache: response too large (${buf.length} bytes)`);
    }
    await writeFile(this._filePath(soundId), buf);
    this.memory.set(soundId, buf);
    this._updateManifest(soundId, {
      soundId,
      soundUrl,
      soundName,
      filename: `${soundId}.bin`,
      cachedAt: new Date().toISOString(),
    });

    console.log(
      `[INFO] SoundCache: stored ${soundName || soundId} (${(buf.length / 1024).toFixed(1)} KB)`,
    );
    return buf;
  }

  toReadable(buffer) {
    return Readable.from(buffer);
  }

  async warmup() {
    const entries = Object.values(this.manifest);
    if (entries.length === 0) {
      console.log("[INFO] SoundCache: no manifest entries to warm up");
      return;
    }

    console.log(
      `[INFO] SoundCache: warming up ${entries.length} cached sound(s)...`,
    );
    let restored = 0,
      pruned = 0;

    await Promise.all(
      entries.map(async ({ soundId, soundUrl, soundName }) => {
        try {
          const filePath = this._filePath(soundId);
          if (existsSync(filePath)) {
            const buf = await readFile(filePath);
            this.memory.set(soundId, buf);
            restored++;
            return;
          }
          await this._fetchAndStore(soundId, soundUrl, soundName);
          restored++;
        } catch (err) {
          console.warn(
            `[WARN] SoundCache: could not restore ${soundName || soundId} — removing from manifest (${err.message})`,
          );
          this._removeManifest(soundId);
          pruned++;
        }
      }),
    );

    console.log(
      `[INFO] SoundCache: warmup complete — ${restored} restored, ${pruned} pruned`,
    );
  }

  async invalidate(soundId) {
    this.memory.delete(soundId);
    this._removeManifest(soundId);
    const filePath = this._filePath(soundId);
    if (existsSync(filePath)) await unlink(filePath).catch(() => {});
    console.log(`[INFO] SoundCache: invalidated ${soundId}`);
  }

  stats() {
    let totalBytes = 0;
    for (const [, buf] of this.memory.entries()) totalBytes += buf.length;
    return {
      memoryCount: this.memory.size,
      totalKB: Math.round(totalBytes / 1024),
      manifestEntries: Object.keys(this.manifest).length,
    };
  }

  _filePath(soundId) {
    return join(CACHE_DIR, `${soundId}.bin`);
  }

  _loadManifest() {
    try {
      if (existsSync(MANIFEST_PATH))
        return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    } catch {}
    return {};
  }

  _updateManifest(soundId, entry) {
    this.manifest[soundId] = entry;
    this._saveManifest();
  }

  _removeManifest(soundId) {
    delete this.manifest[soundId];
    this._saveManifest();
  }

  async _saveManifest() {
    try {
      await writeFile(MANIFEST_PATH, JSON.stringify(this.manifest, null, 2));
    } catch (err) {
      console.error(
        "[ERROR] SoundCache: failed to save manifest:",
        err.message,
      );
    }
  }
}

export const soundCache = new SoundCache();
