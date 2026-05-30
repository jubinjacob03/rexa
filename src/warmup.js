import { soundCache } from "./voice/SoundCache.js";

console.log("[INFO] Warmup: starting cache restore...");

try {
  await soundCache.warmup();
  const { memoryCount, totalKB, manifestEntries } = soundCache.stats();
  console.log(
    `[INFO] Warmup: done — ${memoryCount} sounds in memory, ${totalKB} KB, ${manifestEntries} manifest entries`,
  );
} catch (err) {
  console.warn(
    "[WARN] Warmup failed; continuing with a cold cache (it repopulates on demand):",
    err?.message || err,
  );
}
process.exit(0);

