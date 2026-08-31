import { AUDIO_CONFIG } from "./constants.js";

export class Queue {
  constructor(guildId) {
    this.guildId = guildId;
    this.items = [];
    this.currentItem = null;
  }

  add(soundData) {
    if (this.items.length >= AUDIO_CONFIG.MAX_QUEUE_SIZE) {
      throw new Error("Queue is full");
    }

    const queueItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      soundId: soundData.soundId,
      soundUrl: soundData.soundUrl,
      soundName: soundData.soundName,
      duration: soundData.duration || 0,
      requestedBy: soundData.requestedBy,
      addedAt: new Date().toISOString(),
    };

    this.items.push(queueItem);
    console.log(
      `[INFO] Added ${soundData.soundName} to queue for guild ${this.guildId}`,
    );
    return queueItem;
  }

  next() {
    if (this.items.length === 0) {
      return null;
    }

    this.currentItem = this.items.shift();
    return this.currentItem;
  }

  remove(queueId) {
    const index = this.items.findIndex((item) => item.id === queueId);
    if (index !== -1) {
      const removed = this.items.splice(index, 1)[0];
      console.log(`[INFO] Removed ${removed.soundName} from queue`);
      return removed;
    }
    return null;
  }

  clear() {
    const count = this.items.length;
    this.items = [];
    this.currentItem = null;
    console.log(
      `[INFO] Cleared queue for guild ${this.guildId} (${count} items)`,
    );
    return count;
  }

  getStatus() {
    return {
      current: this.currentItem,
      queue: this.items,
      length: this.items.length,
      totalDuration: this.items.reduce(
        (sum, item) => sum + (item.duration || 0),
        0,
      ),
    };
  }

  isEmpty() {
    return this.items.length === 0;
  }

  size() {
    return this.items.length;
  }
}
