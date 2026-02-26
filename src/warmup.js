import { soundCache } from "./voice/SoundCache.js";

console.log("[INFO] Warmup: starting cache restore...");

try {
  await soundCache.warmup();
  const { memoryCount, totalKB, manifestEntries } = soundCache.stats();
  console.log(
    `[INFO] Warmup: done — ${memoryCount} sounds in memory, ${totalKB} KB, ${manifestEntries} manifest entries`,
  );
  process.exit(0);
} catch (err) {
  console.error("[ERROR] Warmup failed:", err);
  process.exit(1);
}
