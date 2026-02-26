import { Readable } from "stream";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { readFile, writeFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "../../cache/audio");
const MANIFEST_PATH = join(__dirname, "../../cache/manifest.json");

function ensureCacheDir() {
  mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Disk-backed, in-memory audio cache with a JSON manifest.
 * Hot path: memory → disk → network.
 * Manifest shape: { [soundId]: { soundId, soundUrl, soundName, filename, cachedAt } }
 */
class SoundCache {
  constructor() {
    /** @type {Map<string, Buffer>} */
    this.memory = new Map();

    /** @type {Map<string, Promise<Buffer>>} */
    this.pending = new Map();

    ensureCacheDir();
    this.manifest = this._loadManifest();
  }

  /**
   * Returns a Buffer for soundId, checking memory → disk → network in order.
   * @param {string} soundId
   * @param {string} soundUrl
   * @param {string} [soundName]
   * @returns {Promise<Buffer>}
   */
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

  /** @private */
  async _resolve(soundId, soundUrl, soundName) {
    const filePath = this._filePath(soundId);
    if (existsSync(filePath)) {
      const buf = await readFile(filePath);
      this.memory.set(soundId, buf);
      return buf;
    }
    return this._fetchAndStore(soundId, soundUrl, soundName);
  }

  /** @private */
  async _fetchAndStore(soundId, soundUrl, soundName) {
    console.log(`[INFO] SoundCache: fetching ${soundName || soundId}`);
    const res = await fetch(soundUrl);
    if (!res.ok)
      throw new Error(`SoundCache fetch failed: ${res.status} ${soundUrl}`);

    const buf = Buffer.from(await res.arrayBuffer());
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

  /** @param {Buffer} buffer @returns {Readable} */
  toReadable(buffer) {
    return Readable.from(buffer);
  }

  /** Re-download manifest entries missing from disk. Prunes entries that 404. */
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
        const filePath = this._filePath(soundId);
        if (existsSync(filePath)) {
          const buf = await readFile(filePath);
          this.memory.set(soundId, buf);
          restored++;
          return;
        }
        try {
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

  /** @param {string} soundId */
  async invalidate(soundId) {
    this.memory.delete(soundId);
    this._removeManifest(soundId);
    const filePath = this._filePath(soundId);
    if (existsSync(filePath)) await unlink(filePath).catch(() => {});
    console.log(`[INFO] SoundCache: invalidated ${soundId}`);
  }

  /** @returns {{ memoryCount: number, totalKB: number, manifestEntries: number }} */
  stats() {
    let totalBytes = 0;
    for (const buf of this.memory.values()) totalBytes += buf.length;
    return {
      memoryCount: this.memory.size,
      totalKB: Math.round(totalBytes / 1024),
      manifestEntries: Object.keys(this.manifest).length,
    };
  }

  // --- Manifest helpers ---

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

  _saveManifest() {
    try {
      writeFileSync(MANIFEST_PATH, JSON.stringify(this.manifest, null, 2));
    } catch (err) {
      console.error(
        "[ERROR] SoundCache: failed to save manifest:",
        err.message,
      );
    }
  }
}

export const soundCache = new SoundCache();
