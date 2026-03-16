/**
 * Context Manager for AI Agent Conversations
 * Manages conversation history and context using AI SDK patterns
 */

import { embed, cosineSimilarity } from 'ai';
import config, { getEmbeddingModel } from '../config.js';

/**
 * Context Manager for maintaining conversation state
 */
class ContextManager {
  constructor() {
    this.conversations = new Map(); // userId -> conversation data
    this.embeddingModel = null;
    this.initialized = false;
  }

  /**
   * Initialize the context manager
   */
  async initialize() {
    if (this.initialized) return;
    
    this.embeddingModel = getEmbeddingModel();
    this.initialized = true;
    console.log('[CONTEXT MANAGER] Initialized');
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
    
    const message = {
      role, // 'user', 'assistant', 'system'
      content,
      timestamp: new Date().toISOString(),
      metadata,
    };
    
    context.messages.push(message);
    context.lastActivity = new Date().toISOString();
    
    if (context.messages.length > config.rag.maxContextLength) {
      const systemMessages = context.messages.filter(m => m.role === 'system');
      const recentMessages = context.messages
        .filter(m => m.role !== 'system')
        .slice(-config.rag.maxContextLength + systemMessages.length);
      
      context.messages = [...systemMessages, ...recentMessages];
    }
    
    return message;
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
    
    return messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Search conversation history using semantic similarity
   */
  async searchHistory(userId, guildId, query, topK = 3) {
    await this.initialize();
    
    const context = this.getContext(userId, guildId);
    
    if (context.messages.length === 0) {
      return { success: true, results: [] };
    }
    
    try {
      const { embedding: queryEmbedding } = await embed({
        model: this.embeddingModel,
        value: query,
      });
      
      const results = [];
      
      for (const message of context.messages) {
        if (message.content.length < 10) continue;
        
        const { embedding: msgEmbedding } = await embed({
          model: this.embeddingModel,
          value: message.content,
        });
        
        const similarity = cosineSimilarity(queryEmbedding, msgEmbedding);
        
        results.push({
          message,
          similarity,
        });
      }
      
      results.sort((a, b) => b.similarity - a.similarity);
      const topResults = results.slice(0, topK);
      
      return {
        success: true,
        results: topResults,
      };
      
    } catch (error) {
      console.error('[CONTEXT MANAGER] Search error:', error);
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
   * Clear conversation history for a user
   */
  clearHistory(userId, guildId) {
    const contextId = `${guildId}-${userId}`;
    this.conversations.delete(contextId);
    
    return { success: true };
  }

  /**
   * Get active conversations
   */
  getActiveConversations(maxAge = 3600000) { // 1 hour default
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
   * Clean up old conversations
   */
  cleanup(maxAge = 86400000) { // 24 hours default
    const now = Date.now();
    let cleaned = 0;
    
    for (const [contextId, context] of this.conversations.entries()) {
      const lastActivity = new Date(context.lastActivity).getTime();
      const age = now - lastActivity;
      
      if (age > maxAge) {
        this.conversations.delete(contextId);
        cleaned++;
      }
    }
    
    console.log(`[CONTEXT MANAGER] Cleaned up ${cleaned} old conversations`);
    return { success: true, cleaned };
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalMessages = Array.from(this.conversations.values())
      .reduce((sum, ctx) => sum + ctx.messages.length, 0);
    
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
      conversations: Array.from(this.conversations.entries()).map(([id, data]) => ({
        contextId: id,
        ...data,
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import conversations (from persistence)
   */
  import(data) {
    try {
      this.conversations.clear();
      
      data.conversations.forEach(conv => {
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
      
      console.log(`[CONTEXT MANAGER] Imported ${data.conversations.length} conversations`);
      return { success: true, count: data.conversations.length };
      
    } catch (error) {
      console.error('[CONTEXT MANAGER] Import error:', error);
      return { success: false, error: error.message };
    }
  }
}

const contextManager = new ContextManager();

export default contextManager;

export async function addUserMessage(userId, guildId, content, metadata = {}) {
  return await contextManager.addMessage(userId, guildId, 'user', content, metadata);
}

export async function addAssistantMessage(userId, guildId, content, metadata = {}) {
  return await contextManager.addMessage(userId, guildId, 'assistant', content, metadata);
}

export async function addSystemMessage(userId, guildId, content, metadata = {}) {
  return await contextManager.addMessage(userId, guildId, 'system', content, metadata);
}

export function getUserHistory(userId, guildId, limit = null) {
  return contextManager.getFormattedHistory(userId, guildId, limit);
}
