/**
 * @file context-manager.js
 * @description Context Manager for AI Agent Conversations. Manages conversation history and context using AI SDK patterns, enhanced with Supabase persistence for AI memory across restarts.
 */

import { embed, embedMany, cosineSimilarity } from "ai";
import config, { getEmbeddingModel } from "../config.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Context Manager for maintaining conversation state.
 */
class ContextManager {
  /**
   * Creates an instance of ContextManager.
   */
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

  /**
   * Safety net on top of the time-based cleanup: if the in-memory conversation
   * count exceeds the cap, evict the least-recently-active contexts (persisting
   * them first) down to 90% of the cap. Evicted history remains in Supabase.
   * @returns {void}
   */
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

  /**
   * Initializes the context manager and loads data from Supabase.
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    this.embeddingModel = getEmbeddingModel();
    await this.loadFromSupabase();
    this.startAutoSave();

    this.initialized = true;
    console.log("[CONTEXT MANAGER] Initialized with Supabase persistence");
  }

  /**
   * Loads all conversations from Supabase on startup.
   * @returns {Promise<void>}
   */
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
        console.log(
          `[CONTEXT MANAGER] Loaded ${data.length} conversations with ${totalMessages} messages from Supabase`,
        );
      } else {
        console.log(
          "[CONTEXT MANAGER] No existing conversations found in Supabase",
        );
      }
    } catch (error) {
      console.error(
        "[CONTEXT MANAGER] Failed to load from Supabase:",
        error.message,
      );
    }
  }

  /**
   * Saves a single conversation to Supabase (upsert).
   * @param {string} contextId - The ID of the context to save.
   * @returns {Promise<void>}
   */
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
      console.error(
        `[CONTEXT MANAGER] Failed to save ${contextId}:`,
        error.message,
      );
    }
  }

  /**
   * Batch saves all queued conversations to Supabase.
   * @returns {Promise<void>}
   */
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
          messages: context.messages,
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

      console.log(
        `[CONTEXT MANAGER] Batch saved ${updates.length} conversations to Supabase`,
      );
    } catch (error) {
      console.error("[CONTEXT MANAGER] Batch save failed:", error.message);
    }
  }

  /**
   * Queues a conversation for saving (batched).
   * @param {string} contextId - The ID of the context to queue.
   */
  queueSave(contextId) {
    if (!this.autoSaveEnabled) return;
    this.saveQueue.set(contextId, Date.now());
  }

  /**
   * Starts the auto-save interval.
   */
  startAutoSave() {
    if (this.saveInterval) return;

    this.saveInterval = setInterval(async () => {
      await this.batchSave();
    }, this.batchSaveDelay);

    this.cleanupInterval = setInterval(
      async () => {
        await this.cleanup();
      },
      60 * 60 * 1000,
    );

    console.log(
      "[CONTEXT MANAGER] Auto-save enabled (batch every 2s), cleanup every 1h",
    );
  }

  /**
   * Stops the auto-save interval.
   */
  stopAutoSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log("[CONTEXT MANAGER] Auto-save and cleanup disabled");
  }

  /**
   * Forces an immediate save of all conversations.
   * @returns {Promise<void>}
   */
  async forceSaveAll() {
    const contextIds = Array.from(this.conversations.keys());
    contextIds.forEach((id) => this.queueSave(id));
    await this.batchSave();
    console.log("[CONTEXT MANAGER] Force saved all conversations");
  }

  /**
   * Gets or creates a conversation context for a user.
   * @param {string} userId - The user ID.
   * @param {string} guildId - The guild ID.
   * @returns {object} The conversation context.
   */
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

  /**
   * Adds a message to the conversation history.
   * @param {string} userId - The user ID.
   * @param {string} guildId - The guild ID.
   * @param {string} role - The role of the message sender ('user', 'assistant', 'system').
   * @param {string} content - The content of the message.
   * @param {object} [metadata={}] - Additional metadata for the message.
   * @returns {Promise<object>} The added message object.
   */
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

  /**
   * Pre-computes the embedding for a message (background task).
   * @param {object} message - The message object.
   * @returns {Promise<void>}
   * @private
   */
  async _precomputeEmbedding(message) {
    if (message.embedding) return;
    try {
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: message.content,
      });
      message.embedding = embedding;
    } catch (e) {
      console.error(
        "[CONTEXT MANAGER] Embedding error for message:",
        e.message,
      );
    }
  }

  /**
   * Gets the conversation history for a user.
   * @param {string} userId - The user ID.
   * @param {string} guildId - The guild ID.
   * @param {number|null} [limit=null] - The maximum number of messages to return.
   * @returns {Array<object>} The conversation history.
   */
  getHistory(userId, guildId, limit = null) {
    const context = this.getContext(userId, guildId);

    if (limit) {
      return context.messages.slice(-limit);
    }

    return context.messages;
  }

  /**
   * Gets the conversation history formatted for the AI SDK.
   * @param {string} userId - The user ID.
   * @param {string} guildId - The guild ID.
   * @param {number|null} [limit=null] - The maximum number of messages to return.
   * @returns {Array<object>} The formatted conversation history.
   */
  getFormattedHistory(userId, guildId, limit = null) {
    const messages = this.getHistory(userId, guildId, limit);

    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Searches the conversation history using semantic similarity.
   * Uses pre-computed embeddings when available for instant search.
   * @param {string} userId - The user ID.
   * @param {string} guildId - The guild ID.
   * @param {string} query - The search query.
   * @param {number} [topK=3] - The number of top results to return.
   * @returns {Promise<object>} The search results.
   */
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
      console.error("[CONTEXT MANAGER] Search error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Updates the conversation metadata.
   * @param {string} userId - The user ID.
   * @param {string} guildId - The guild ID.
   * @param {object} metadata - The metadata to merge.
   */
  updateMetadata(userId, guildId, metadata) {
    const context = this.getContext(userId, guildId);
    context.metadata = {
      ...context.metadata,
      ...metadata,
    };
  }

  /**
   * Gets the conversation metadata.
   * @param {string} userId - The user ID.
   * @param {string} guildId - The guild ID.
   * @returns {object} The conversation metadata.
   */
  getMetadata(userId, guildId) {
    const context = this.getContext(userId, guildId);
    return context.metadata;
  }

  /**
   * Clears the conversation history for a user (memory and Supabase).
   * @param {string} userId - The user ID.
   * @param {string} guildId - The guild ID.
   * @returns {Promise<object>} The result of the clear operation.
   */
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
      console.error(
        "[CONTEXT MANAGER] Clear history Supabase error:",
        error.message,
      );
    }

    return { success: true };
  }

  /**
   * Gets active conversations.
   * @param {number} [maxAge=3600000] - The maximum age of a conversation to be considered active (in milliseconds).
   * @returns {Array<object>} The active conversations.
   */
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

  /**
   * Cleans up old conversations (in memory and Supabase).
   * @param {number} [maxAge=86400000] - The maximum age of a conversation to be kept (in milliseconds).
   * @returns {Promise<object>} The result of the cleanup operation.
   */
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
        console.error(
          "[CONTEXT MANAGER] Cleanup Supabase error:",
          error.message,
        );
      }
    }

    console.log(`[CONTEXT MANAGER] Cleaned up ${cleaned} old conversations`);
    return { success: true, cleaned };
  }

  /**
   * Graceful shutdown - saves all pending changes.
   * @returns {Promise<void>}
   */
  async shutdown() {
    console.log("[CONTEXT MANAGER] Shutting down...");
    this.stopAutoSave();
    await this.forceSaveAll();
    console.log("[CONTEXT MANAGER] Shutdown complete");
  }

  /**
   * Gets statistics about the context manager.
   * @returns {object} The statistics.
   */
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

  /**
   * Exports conversations (for persistence).
   * @returns {object} The exported data.
   */
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

  /**
   * Imports conversations (from persistence).
   * @param {object} data - The data to import.
   * @returns {object} The result of the import operation.
   */
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

      console.log(
        `[CONTEXT MANAGER] Imported ${data.conversations.length} conversations`,
      );
      return { success: true, count: data.conversations.length };
    } catch (error) {
      console.error("[CONTEXT MANAGER] Import error:", error);
      return { success: false, error: error.message };
    }
  }
}

const contextManager = new ContextManager();

export default contextManager;

/**
 * Adds a user message to the conversation history.
 * @param {string} userId - The user ID.
 * @param {string} guildId - The guild ID.
 * @param {string} content - The content of the message.
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {Promise<object>} The added message.
 */
export async function addUserMessage(userId, guildId, content, metadata = {}) {
  return await contextManager.addMessage(
    userId,
    guildId,
    "user",
    content,
    metadata,
  );
}

/**
 * Adds an assistant message to the conversation history.
 * @param {string} userId - The user ID.
 * @param {string} guildId - The guild ID.
 * @param {string} content - The content of the message.
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {Promise<object>} The added message.
 */
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

/**
 * Adds a system message to the conversation history.
 * @param {string} userId - The user ID.
 * @param {string} guildId - The guild ID.
 * @param {string} content - The content of the message.
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {Promise<object>} The added message.
 */
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

/**
 * Gets the formatted conversation history for a user.
 * @param {string} userId - The user ID.
 * @param {string} guildId - The guild ID.
 * @param {number|null} [limit=null] - The maximum number of messages to return.
 * @returns {Array<object>} The formatted conversation history.
 */
export function getUserHistory(userId, guildId, limit = null) {
  return contextManager.getFormattedHistory(userId, guildId, limit);
}
