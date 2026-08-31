import { embed, embedMany, cosineSimilarity } from "ai";
import config, { getEmbeddingModel } from "../config.js";
import supabase from "../../utils/supabaseClient.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("context");

class ContextManager {
  constructor() {
    this.conversations = new Map();
    this.embeddingModel = null;
    this.initialized = false;
    this.saveQueue = new Map();
    this.saveInterval = null;
    this.autoSaveEnabled = true;
    this.batchSaveDelay = 2000;
    this.maxConversations = config.rag?.maxConversations || 5000;
    this.maxContextLength = config.rag?.maxContextLength || 30;
  }

  enforceMemoryLimit() {
    if (this.conversations.size <= this.maxConversations) return;
    const target = Math.floor(this.maxConversations * 0.9);
    const sorted = [...this.conversations.entries()].sort(
      (a, b) =>
        new Date(a[1].lastActivity).getTime() -
        new Date(b[1].lastActivity).getTime(),
    );
    const evictCount = this.conversations.size - target;
    for (let n = 0; n < evictCount && n < sorted.length; n += 1) {
      const [contextId] = sorted[n];
      this.queueSave(contextId);
      this.conversations.delete(contextId);
    }
  }

  async initialize() {
    if (this.initialized) return;

    this.embeddingModel = getEmbeddingModel();
    await this.loadFromSupabase();
    this.startAutoSave();

    this.initialized = true;
  }

  async loadFromSupabase() {
    try {
      const { data, error } = await supabase
        .from("conversation_history")
        .select("*")
        .order("last_activity", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        data.forEach((row) => {
          this.conversations.set(row.context_id, {
            userId: row.user_id,
            guildId: row.guild_id,
            messages: row.messages || [],
            metadata: row.metadata || {},
            createdAt: row.created_at,
            lastActivity: row.last_activity,
          });
        });

        const totalMessages = data.reduce(
          (sum, row) => sum + (row.message_count || 0),
          0,
        );
        log.info(
          `Loaded ${data.length} conversations with ${totalMessages} messages from Supabase`,
        );
      }
    } catch (error) {
      log.error("Failed to load from Supabase:", error.message);
    }
  }
  async saveToSupabase(contextId) {
    const context = this.conversations.get(contextId);
    if (!context) return;

    try {
      const { error } = await supabase.from("conversation_history").upsert(
        {
          context_id: contextId,
          guild_id: context.guildId,
          user_id: context.userId,
          messages: context.messages,
          metadata: context.metadata,
          created_at: context.createdAt,
          last_activity: context.lastActivity,
          last_synced: new Date().toISOString(),
        },
        {
          onConflict: "context_id",
        },
      );

      if (error) throw error;
    } catch (error) {
      log.error(`Failed to save ${contextId}:`, error.message);
    }
  }

  async batchSave() {
    if (this.saveQueue.size === 0) return;

    const contextIds = Array.from(this.saveQueue.keys());
    this.saveQueue.clear();

    const updates = contextIds
      .map((contextId) => {
        const context = this.conversations.get(contextId);
        if (!context) return null;

        return {
          context_id: contextId,
          guild_id: context.guildId,
          user_id: context.userId,
          messages: context.messages.map(
            ({ embedding: _embedding, ...msg }) => msg,
          ),
          metadata: context.metadata,
          created_at: context.createdAt,
          last_activity: context.lastActivity,
          last_synced: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (updates.length === 0) return;

    try {
      const { error } = await supabase
        .from("conversation_history")
        .upsert(updates, {
          onConflict: "context_id",
        });

      if (error) throw error;

      log.info(`Batch saved ${updates.length} conversations to Supabase`);
    } catch (error) {
      log.error("Batch save failed:", error.message);
    }
  }

  queueSave(contextId) {
    if (!this.autoSaveEnabled) return;
    this.saveQueue.set(contextId, Date.now());
  }

  startAutoSave() {
    if (this.saveInterval) return;

    this.saveInterval = setInterval(async () => {
      await this.batchSave();
    }, this.batchSaveDelay);
    this.saveInterval.unref();

    this.cleanupInterval = setInterval(
      async () => {
        await this.cleanup();
      },
      60 * 60 * 1000,
    );
    this.cleanupInterval.unref();
  }

  stopAutoSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  async forceSaveAll() {
    const contextIds = Array.from(this.conversations.keys());
    contextIds.forEach((id) => this.queueSave(id));
    await this.batchSave();
  }

  getContext(userId, guildId) {
    const contextId = `${guildId}-${userId}`;

    if (!this.conversations.has(contextId)) {
      this.conversations.set(contextId, {
        userId,
        guildId,
        messages: [],
        metadata: {},
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      });
      this.enforceMemoryLimit();
    }

    return this.conversations.get(contextId);
  }

  async addMessage(userId, guildId, role, content, metadata = {}) {
    await this.initialize();

    const context = this.getContext(userId, guildId);
    const contextId = `${guildId}-${userId}`;

    const message = {
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata,
      embedding: null,
    };

    if (content.length >= 20 && role !== "system") {
      this._precomputeEmbedding(message).catch(() => {});
    }

    context.messages.push(message);
    context.lastActivity = new Date().toISOString();

    if (context.messages.length > this.maxContextLength) {
      const systemMessages = context.messages.filter(
        (m) => m.role === "system",
      );
      const recentMessages = context.messages
        .filter((m) => m.role !== "system")
        .slice(-this.maxContextLength + systemMessages.length);

      context.messages = [...systemMessages, ...recentMessages];
    }

    this.queueSave(contextId);

    return message;
  }

  async _precomputeEmbedding(message) {
    if (message.embedding) return;
    try {
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: message.content,
      });
      message.embedding = embedding;
    } catch (e) {
      log.error("Embedding error for message:", e.message);
    }
  }

  getHistory(userId, guildId, limit = null) {
    const context = this.getContext(userId, guildId);

    if (limit) {
      return context.messages.slice(-limit);
    }

    return context.messages;
  }

  getFormattedHistory(userId, guildId, limit = null) {
    const messages = this.getHistory(userId, guildId, limit);

    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  async searchHistory(userId, guildId, query, topK = 3) {
    await this.initialize();

    const context = this.getContext(userId, guildId);

    if (context.messages.length === 0) {
      return { success: true, results: [] };
    }

    try {
      const validMessages = context.messages.filter(
        (m) => m.content.length >= 10,
      );

      if (validMessages.length === 0) {
        return { success: true, results: [] };
      }

      const { embedding: queryEmbedding } = await embed({
        model: this.embeddingModel,
        value: query,
      });

      const needsEmbedding = validMessages.filter((m) => !m.embedding);

      if (needsEmbedding.length > 0) {
        const { embeddings } = await embedMany({
          model: this.embeddingModel,
          values: needsEmbedding.map((m) => m.content),
        });
        needsEmbedding.forEach((m, i) => {
          m.embedding = embeddings[i];
        });
      }

      const results = validMessages.map((message) => ({
        message,
        similarity: cosineSimilarity(queryEmbedding, message.embedding),
      }));

      results.sort((a, b) => b.similarity - a.similarity);
      const topResults = results.slice(0, topK);

      return {
        success: true,
        results: topResults,
      };
    } catch (error) {
      log.error("Search error:", error);
      return { success: false, error: error.message };
    }
  }

  updateMetadata(userId, guildId, metadata) {
    const context = this.getContext(userId, guildId);
    context.metadata = {
      ...context.metadata,
      ...metadata,
    };
  }

  getMetadata(userId, guildId) {
    const context = this.getContext(userId, guildId);
    return context.metadata;
  }

  async clearHistory(userId, guildId) {
    const contextId = `${guildId}-${userId}`;
    this.conversations.delete(contextId);

    try {
      const { error } = await supabase
        .from("conversation_history")
        .delete()
        .eq("context_id", contextId);

      if (error) throw error;
    } catch (error) {
      log.error("Clear history Supabase error:", error.message);
    }

    return { success: true };
  }

  getActiveConversations(maxAge = 3600000) {
    const now = Date.now();
    const active = [];

    for (const [contextId, context] of this.conversations.entries()) {
      const lastActivity = new Date(context.lastActivity).getTime();
      const age = now - lastActivity;

      if (age < maxAge) {
        active.push({
          contextId,
          userId: context.userId,
          guildId: context.guildId,
          messageCount: context.messages.length,
          lastActivity: context.lastActivity,
          age: Math.floor(age / 1000),
        });
      }
    }

    return active;
  }

  async cleanup(maxAge = 86400000) {
    const now = Date.now();
    let cleaned = 0;
    const toDelete = [];

    for (const [contextId, context] of this.conversations.entries()) {
      const lastActivity = new Date(context.lastActivity).getTime();
      const age = now - lastActivity;

      if (age > maxAge) {
        this.conversations.delete(contextId);
        toDelete.push(contextId);
        cleaned++;
      }
    }

    if (toDelete.length > 0) {
      try {
        const { error } = await supabase
          .from("conversation_history")
          .delete()
          .in("context_id", toDelete);

        if (error) throw error;
      } catch (error) {
        log.error("Cleanup Supabase error:", error.message);
      }
    }

    if (cleaned > 0) {
      log.info(`Cleaned up ${cleaned} old conversations`);
    }
    return { success: true, cleaned };
  }

  async shutdown() {
    this.stopAutoSave();
    await this.forceSaveAll();
  }

  getStats() {
    const totalMessages = Array.from(this.conversations.values()).reduce(
      (sum, ctx) => sum + ctx.messages.length,
      0,
    );

    return {
      totalConversations: this.conversations.size,
      totalMessages,
      initialized: this.initialized,
    };
  }

  export() {
    return {
      conversations: Array.from(this.conversations.entries()).map(
        ([id, data]) => ({
          contextId: id,
          ...data,
        }),
      ),
      exportedAt: new Date().toISOString(),
    };
  }

  import(data) {
    try {
      this.conversations.clear();

      data.conversations.forEach((conv) => {
        const contextId = conv.contextId || `${conv.guildId}-${conv.userId}`;
        this.conversations.set(contextId, {
          userId: conv.userId,
          guildId: conv.guildId,
          messages: conv.messages,
          metadata: conv.metadata,
          createdAt: conv.createdAt,
          lastActivity: conv.lastActivity,
        });
      });

      log.info(`Imported ${data.conversations.length} conversations`);
      return { success: true, count: data.conversations.length };
    } catch (error) {
      log.error("Import error:", error);
      return { success: false, error: error.message };
    }
  }
}

const contextManager = new ContextManager();

export default contextManager;

export async function addUserMessage(userId, guildId, content, metadata = {}) {
  return await contextManager.addMessage(
    userId,
    guildId,
    "user",
    content,
    metadata,
  );
}

export async function addAssistantMessage(
  userId,
  guildId,
  content,
  metadata = {},
) {
  return await contextManager.addMessage(
    userId,
    guildId,
    "assistant",
    content,
    metadata,
  );
}

export async function addSystemMessage(
  userId,
  guildId,
  content,
  metadata = {},
) {
  return await contextManager.addMessage(
    userId,
    guildId,
    "system",
    content,
    metadata,
  );
}

export function getUserHistory(userId, guildId, limit = null) {
  return contextManager.getFormattedHistory(userId, guildId, limit);
}
