/**
 * Context Manager for AI Agent Conversations
 * Manages conversation history and context using AI SDK patterns
 * Enhanced with Supabase persistence for AI memory across restarts
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
 * Context Manager for maintaining conversation state
 */
class ContextManager {
  constructor() {
    this.conversations = new Map(); // userId -> conversation data
    this.embeddingModel = null;
    this.initialized = false;
    this.saveQueue = new Map(); // Batch save queue
    this.saveInterval = null;
    this.autoSaveEnabled = true;
    this.batchSaveDelay = 2000; // 2 seconds delay for batching
  }

  /**
   * Initialize the context manager and load from Supabase
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
   * Load all conversations from Supabase on startup
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
      // Continue initialization even if load fails
    }
  }

  /**
   * Save a single conversation to Supabase (upsert)
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
   * Batch save all queued conversations
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
   * Queue a conversation for saving (batched)
   */
  queueSave(contextId) {
    if (!this.autoSaveEnabled) return;
    this.saveQueue.set(contextId, Date.now());
  }

  /**
   * Start auto-save interval
   */
  startAutoSave() {
    if (this.saveInterval) return;

    this.saveInterval = setInterval(async () => {
      await this.batchSave();
    }, this.batchSaveDelay);

    console.log("[CONTEXT MANAGER] Auto-save enabled (batch every 2s)");
  }

  /**
   * Stop auto-save interval
   */
  stopAutoSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
      console.log("[CONTEXT MANAGER] Auto-save disabled");
    }
  }

  /**
   * Force save all conversations immediately
   */
  async forceSaveAll() {
    const contextIds = Array.from(this.conversations.keys());
    contextIds.forEach((id) => this.queueSave(id));
    await this.batchSave();
    console.log("[CONTEXT MANAGER] Force saved all conversations");
  }

  /**
   * Get or create conversation context for a user
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
    }

    return this.conversations.get(contextId);
  }

  /**
   * Add a message to conversation history
   */
  async addMessage(userId, guildId, role, content, metadata = {}) {
    await this.initialize();

    const context = this.getContext(userId, guildId);
    const contextId = `${guildId}-${userId}`;

    const message = {
      role, // 'user', 'assistant', 'system'
      content,
      timestamp: new Date().toISOString(),
      metadata,
      embedding: null,
    };

    // Pre-compute embedding for substantial messages
    if (content.length >= 20 && role !== "system") {
      this._precomputeEmbedding(message).catch(() => {});
    }

    context.messages.push(message);
    context.lastActivity = new Date().toISOString();

    if (context.messages.length > config.rag.maxContextLength) {
      const systemMessages = context.messages.filter(
        (m) => m.role === "system",
      );
      const recentMessages = context.messages
        .filter((m) => m.role !== "system")
        .slice(-config.rag.maxContextLength + systemMessages.length);

      context.messages = [...systemMessages, ...recentMessages];
    }

    this.queueSave(contextId);

    return message;
  }

  /**
   * Pre-compute embedding for a message (background task)
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
   * Get conversation history for a user
   */
  getHistory(userId, guildId, limit = null) {
    const context = this.getContext(userId, guildId);

    if (limit) {
      return context.messages.slice(-limit);
    }

    return context.messages;
  }

  /**
   * Get conversation history formatted for AI SDK
   */
  getFormattedHistory(userId, guildId, limit = null) {
    const messages = this.getHistory(userId, guildId, limit);

    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Search conversation history using semantic similarity
   * Uses pre-computed embeddings when available for instant search
   */
  async searchHistory(userId, guildId, query, topK = 3) {
    await this.initialize();

    const context = this.getContext(userId, guildId);

    if (context.messages.length === 0) {
      return { success: true, results: [] };
    }

    try {
      // Filter messages worth searching (>10 chars)
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

      // Find messages missing embeddings
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
   * Update conversation metadata
   */
  updateMetadata(userId, guildId, metadata) {
    const context = this.getContext(userId, guildId);
    context.metadata = {
      ...context.metadata,
      ...metadata,
    };
  }

  /**
   * Get conversation metadata
   */
  getMetadata(userId, guildId) {
    const context = this.getContext(userId, guildId);
    return context.metadata;
  }

  /**
   * Clear conversation history for a user (memory and Supabase)
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
   * Get active conversations
   */
  getActiveConversations(maxAge = 3600000) {
    // 1 hour default
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
          age: Math.floor(age / 1000), // seconds
        });
      }
    }

    return active;
  }

  /**
   * Clean up old conversations (in memory and Supabase)
   */
  async cleanup(maxAge = 86400000) {
    // 24 hours default
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
   * Graceful shutdown - save all pending changes
   */
  async shutdown() {
    console.log("[CONTEXT MANAGER] Shutting down...");
    this.stopAutoSave();
    await this.forceSaveAll();
    console.log("[CONTEXT MANAGER] Shutdown complete");
  }

  /**
   * Get statistics
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
   * Export conversations (for persistence)
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
   * Import conversations (from persistence)
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
