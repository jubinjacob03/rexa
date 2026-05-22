/**
 * @file knowledge-base.js
 * @description Knowledge Base - Full RAG System using Supabase pgvector. Comprehensive document management with FREE Gemini embeddings.
 */

import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import config from "../config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

let initialized = false;
let initializationPromise = null;

const documentMetadata = new Map();

const embeddingCache = new Map();
const EMBEDDING_CACHE_TTL = 60 * 60 * 1000;
const EMBEDDING_CACHE_MAX = 500;

/**
 * Hashes a text string.
 * @param {string} text - The text to hash.
 * @returns {string} The hashed string.
 */
function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/**
 * Retrieves a cached embedding for a given text.
 * @param {string} text - The text to retrieve the embedding for.
 * @returns {Array<number>|null} The embedding, or null if not found or expired.
 */
function getCachedEmbedding(text) {
  const key = hashText(text);
  const cached = embeddingCache.get(key);
  if (cached && Date.now() - cached.timestamp < EMBEDDING_CACHE_TTL) {
    return cached.embedding;
  }
  embeddingCache.delete(key);
  return null;
}

/**
 * Sets a cached embedding for a given text.
 * @param {string} text - The text to cache the embedding for.
 * @param {Array<number>} embedding - The embedding to cache.
 */
function setCachedEmbedding(text, embedding) {
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    const oldest = embeddingCache.keys().next().value;
    embeddingCache.delete(oldest);
  }
  embeddingCache.set(hashText(text), { embedding, timestamp: Date.now() });
}

/**
 * Initializes the knowledge base with Supabase pgvector.
 * @returns {Promise<void>}
 */
async function initialize() {
  if (initialized) {
    console.log("[KNOWLEDGE BASE] Already initialized");
    return;
  }

  if (initializationPromise) {
    console.log("[KNOWLEDGE BASE] Initialization in progress, waiting...");
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      console.log("[KNOWLEDGE BASE] Initializing Supabase pgvector...");

      await ensureVectorTable();

      initialized = true;
      console.log("[KNOWLEDGE BASE] Supabase initialized successfully");

      console.log(
        "[KNOWLEDGE BASE] Custom KB successfully loaded from SHANTHA_KNOWLEDGE_BASE.txt",
      );
    } catch (error) {
      console.error("[KNOWLEDGE BASE] Initialization error:", error);
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Ensures the vector table exists in Supabase.
 * @returns {Promise<void>}
 */
async function ensureVectorTable() {
  try {
    const { error } = await supabase
      .from("knowledge_embeddings")
      .select("id")
      .limit(1);

    if (error && error.code !== "PGRST116") {
      console.error(
        "[KNOWLEDGE BASE] Vector table check error:",
        error.message,
      );
      console.log("[KNOWLEDGE BASE] Please run the following SQL in Supabase:");
      console.log(`
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create knowledge embeddings table
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(3072),
  category TEXT,
  tags TEXT[],
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function for similarity search
CREATE OR REPLACE FUNCTION match_knowledge_embeddings(
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  filter_category text DEFAULT NULL,
  filter_tags text[] DEFAULT NULL
)
RETURNS TABLE (
  id text,
  content text,
  category text,
  tags text[],
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    knowledge_embeddings.id,
    knowledge_embeddings.content,
    knowledge_embeddings.category,
    knowledge_embeddings.tags,
    knowledge_embeddings.metadata,
    1 - (knowledge_embeddings.embedding <=> query_embedding) as similarity
  FROM knowledge_embeddings
  WHERE 
    (filter_category IS NULL OR knowledge_embeddings.category = filter_category)
    AND (filter_tags IS NULL OR knowledge_embeddings.tags && filter_tags)
    AND 1 - (knowledge_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY knowledge_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
      `);
    } else {
      console.log("[KNOWLEDGE BASE] Vector table verified");
    }
  } catch (error) {
    console.error("[KNOWLEDGE BASE] Table verification error:", error);
  }
}

/**
 * Loads default knowledge about Shantha and Remani.
 * @returns {Promise<void>}
 */
async function _loadDefaultKnowledge() {
  console.log("[KNOWLEDGE BASE] Loading default knowledge...");

  const defaultDocs = [
    {
      id: "shantha-intro",
      content: `# Shantha Bot Overview
      
Shantha is a Discord server management bot that handles verification, private voice channels, 
and server administration. It's designed for the Shantha community Discord server.

Key Features:
- Member verification system
- Private voice channel management
- Server statistics tracking
- Administrative commands
- Integration with Remani music bot`,
      category: "shantha",
      tags: ["intro", "overview"],
    },

    {
      id: "shantha-verification",
      content: `# Verification System
      
The verification system requires new members to verify before accessing the server.

Commands:
- /setup-verification - Set up verification channel
- Verification happens through button clicks
- Members get verified role upon completion
- Logs verification events

Features:
- Automatic role assignment
- Verification logging
- Welcome messages
- Member tracking`,
      category: "verification",
      tags: ["commands", "security"],
    },

    {
      id: "shantha-private-vc",
      content: `# Private Voice Channels
      
Shantha manages private voice channels that users can create and control.

Commands:
- /private - Create a private voice channel
- /add <user> - Add user to your private channel
- /remove <user> - Remove user from your private channel

Features:
- Automatic channel creation
- Owner-controlled permissions
- Auto-delete when empty
- Custom channel names`,
      category: "private_vc",
      tags: ["voice", "channels"],
    },

    {
      id: "remani-intro",
      content: `# Remani Music Bot
      
Remani is a music bot that plays music in Discord voice channels using Lavalink.

Key Features:
- YouTube music playback
- Spotify integration
- Queue management
- Audio filters
- Volume control
- Loop modes (track, queue, off)`,
      category: "remani",
      tags: ["music", "intro"],
    },

    {
      id: "remani-commands",
      content: `# Remani Music Commands
      
Playback Commands:
- /play <query> - Play a song or playlist
- /pause - Pause current track
- /resume - Resume playback
- /skip - Skip current track
- /stop - Stop playback and clear queue

Queue Commands:
- /queue - View current queue
- /remove <position> - Remove song from queue
- /move <from> <to> - Move song position
- /shuffle - Shuffle the queue
- /skipto <position> - Skip to specific song

Info Commands:
- /nowplaying - Show current track
- /lyrics - Get lyrics for current song

Audio Commands:
- /volume <0-100> - Set volume
- /loop <mode> - Set loop mode
- /filter <name> - Apply audio filter
- /seek <time> - Seek to position in track`,
      category: "commands",
      tags: ["remani", "music"],
    },

    {
      id: "server-stats",
      content: `# Server Statistics
      
Shantha tracks various server metrics:

Member Stats:
- Total member count
- Online/offline status
- New member joins
- Member verification status

Channel Stats:
- Total channels (text/voice)
- Active voice channels
- Private VC count

Server Info:
- Server name and ID
- Role count
- Emoji count
- Boost level`,
      category: "server",
      tags: ["stats", "info"],
    },
  ];

  for (const doc of defaultDocs) {
    try {
      await addDocumentToSupabase(doc.id, doc.content, {
        category: doc.category,
        tags: doc.tags,
      });

      console.log(`[KNOWLEDGE BASE] Loaded: ${doc.id}`);
    } catch (error) {
      console.error(`[KNOWLEDGE BASE] Error loading ${doc.id}:`, error.message);
    }
  }

  console.log(
    `[KNOWLEDGE BASE] Loaded ${defaultDocs.length} default documents`,
  );
}

/**
 * Generates an embedding for the given text.
 * @param {string} text - The text to embed.
 * @returns {Promise<Array<number>>} The generated embedding.
 */
async function generateEmbedding(text) {
  const cached = getCachedEmbedding(text);
  if (cached) return cached;

  try {
    const { embedMany } = await import("ai");
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");

    const google = createGoogleGenerativeAI({
      apiKey: config.apiKeys.google,
    });

    const { embeddings } = await embedMany({
      model: google.textEmbeddingModel("gemini-embedding-001"),
      values: [text],
    });

    setCachedEmbedding(text, embeddings[0]);
    return embeddings[0];
  } catch (error) {
    console.error("[KNOWLEDGE BASE] Embedding generation error:", error);
    throw error;
  }
}

/**
 * Adds a document to Supabase with its embedding.
 * @param {string} id - The document ID.
 * @param {string} content - The document content.
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {Promise<void>}
 */
async function addDocumentToSupabase(id, content, metadata = {}) {
  const embedding = await generateEmbedding(content);

  const { error } = await supabase.from("knowledge_embeddings").upsert(
    {
      id,
      content,
      embedding,
      category: metadata.category || null,
      tags: metadata.tags || [],
      metadata: metadata,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "id",
    },
  );

  if (error) throw error;

  documentMetadata.set(id, {
    ...metadata,
    addedAt: new Date().toISOString(),
  });
}

/**
 * Adds a text document to the knowledge base.
 * @param {string} id - The document ID.
 * @param {string} content - The document content.
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {Promise<object>} The result of the operation.
 */
export async function addDocument(id, content, metadata = {}) {
  try {
    await initialize();
    await addDocumentToSupabase(id, content, metadata);

    console.log(`[KNOWLEDGE BASE] Added document: ${id}`);
    return { success: true, id };
  } catch (error) {
    console.error(`[KNOWLEDGE BASE] Error adding document:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Adds a web page to the knowledge base.
 * @param {string} url - The URL of the web page.
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {Promise<object>} The result of the operation.
 */
export async function addWebPage(url, metadata = {}) {
  try {
    await initialize();
    const { fetchWebPage } = await import("./executor-tools.js");
    const result = await fetchWebPage(url);

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch web page");
    }

    const id = `web:${url}`;
    await addDocumentToSupabase(id, result.text, {
      ...metadata,
      url,
      type: "web",
    });

    console.log(`[KNOWLEDGE BASE] Added web page: ${url}`);
    return { success: true, id, url };
  } catch (error) {
    console.error(`[KNOWLEDGE BASE] Error adding web page:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Queries the knowledge base using Supabase pgvector similarity search.
 * @param {string} question - The query string.
 * @param {object} [options={}] - Query options.
 * @param {number} [options.topK=5] - Number of top results to return.
 * @param {string} [options.category=null] - Category filter.
 * @param {Array<string>} [options.tags=null] - Tags filter.
 * @param {number} [options.threshold=0.5] - Similarity threshold.
 * @returns {Promise<object>} The query results.
 */
export async function query(question, options = {}) {
  const {
    topK = config.rag.topK || 5,
    category = null,
    tags = null,
    threshold = 0.5,
  } = options;

  try {
    await initialize();
    console.log(`[KNOWLEDGE BASE] Query: "${question}"`);

    const queryEmbedding = await generateEmbedding(question);

    const { data, error } = await supabase.rpc("match_knowledge_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: topK,
      filter_category: category,
      filter_tags: tags,
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        success: true,
        answer:
          "I could not find relevant information to answer your question.",
        sources: [],
        hasResults: false,
      };
    }

    const formattedContext = data
      .map((doc, i) => `[${i + 1}] ${doc.content}`)
      .join("\n\n");

    return {
      success: true,
      answer: formattedContext,
      sources: data.map((doc) => ({
        id: doc.id,
        content: doc.content.substring(0, 200),
        category: doc.category,
        similarity: doc.similarity,
      })),
      hasResults: true,
      query: question,
    };
  } catch (error) {
    console.error(`[KNOWLEDGE BASE] Query error:`, error);
    return {
      success: false,
      error: error.message,
      query: question,
    };
  }
}

/**
 * Searches for documents (without generating an answer).
 * @param {string} queryText - The search query.
 * @param {object} [options={}] - Search options.
 * @param {number} [options.topK=5] - Number of top results to return.
 * @param {string} [options.category=null] - Category filter.
 * @param {Array<string>} [options.tags=null] - Tags filter.
 * @param {number} [options.threshold=0.5] - Similarity threshold.
 * @returns {Promise<object>} The search results.
 */
export async function search(queryText, options = {}) {
  const {
    topK = config.rag.topK || 5,
    category = null,
    tags = null,
    threshold = 0.5,
  } = options;

  try {
    await initialize();
    console.log(`[KNOWLEDGE BASE] Search: "${queryText}"`);

    const queryEmbedding = await generateEmbedding(queryText);

    const { data, error } = await supabase.rpc("match_knowledge_embeddings", {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: topK,
      filter_category: category,
      filter_tags: tags,
    });

    if (error) throw error;

    return {
      success: true,
      results: (data || []).map((doc) => ({
        id: doc.id,
        text: doc.content,
        relevance: doc.similarity,
        category: doc.category,
        tags: doc.tags,
        metadata: doc.metadata,
      })),
      totalMatches: data?.length || 0,
      query: queryText,
    };
  } catch (error) {
    console.error(`[KNOWLEDGE BASE] Search error:`, error);
    return {
      success: false,
      error: error.message,
      query: queryText,
    };
  }
}

/**
 * Gets all documents from Supabase.
 * @returns {Promise<object>} The documents.
 */
export async function getDocuments() {
  try {
    const { data, error } = await supabase
      .from("knowledge_embeddings")
      .select("id, category, tags, metadata, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return {
      success: true,
      documents: data || [],
    };
  } catch (error) {
    console.error("[KNOWLEDGE BASE] Error fetching documents:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Deletes a document from Supabase.
 * @param {string} id - The document ID.
 * @returns {Promise<object>} The result of the deletion.
 */
export async function deleteDocument(id) {
  try {
    const { error } = await supabase
      .from("knowledge_embeddings")
      .delete()
      .eq("id", id);

    if (error) throw error;

    documentMetadata.delete(id);

    return {
      success: true,
      message: "Document deleted successfully",
    };
  } catch (error) {
    console.error("[KNOWLEDGE BASE] Error deleting document:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Gets statistics from Supabase.
 * @returns {Promise<object>} The statistics.
 */
export async function getStats() {
  try {
    const { count, error: countError } = await supabase
      .from("knowledge_embeddings")
      .select("*", { count: "exact", head: true });

    const { data, error } = await supabase
      .from("knowledge_embeddings")
      .select("category, tags");

    if (error || countError) throw error || countError;

    const categories = {};
    const tags = new Set();

    (data || []).forEach((doc) => {
      const cat = doc.category || "uncategorized";
      categories[cat] = (categories[cat] || 0) + 1;

      if (doc.tags) {
        doc.tags.forEach((tag) => tags.add(tag));
      }
    });

    return {
      totalDocuments: count || 0,
      initialized,
      categories,
      totalTags: tags.size,
      tags: Array.from(tags),
    };
  } catch (error) {
    console.error("[KNOWLEDGE BASE] Error getting stats:", error);
    return {
      totalDocuments: 0,
      initialized,
      categories: {},
      totalTags: 0,
      tags: [],
    };
  }
}

/**
 * Resets the knowledge base (clears all embeddings from Supabase).
 * @returns {Promise<object>} The result of the reset operation.
 */
export async function reset() {
  try {
    const { error } = await supabase
      .from("knowledge_embeddings")
      .delete()
      .neq("id", "");

    if (error) throw error;

    documentMetadata.clear();

    return {
      success: true,
      message: "Knowledge base reset successfully",
    };
  } catch (error) {
    console.error("[KNOWLEDGE BASE] Error resetting:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * RAG Tool for AI agent.
 */
export const ragTool = tool({
  description: `Search knowledge base for information about Shantha, Remani, commands, and server features. 
Uses advanced RAG with embedJS for accurate, contextual answers. Returns both answers and source documents.`,

  parameters: z.object({
    query: z.string().describe("Search query or question"),
    category: z
      .enum([
        "server",
        "shantha",
        "remani",
        "commands",
        "verification",
        "private_vc",
        "music",
        "general",
      ])
      .optional(),
    tags: z.array(z.string()).optional(),
    topK: z.number().min(1).max(10).optional().default(5),
    mode: z
      .enum(["query", "search"])
      .optional()
      .default("query")
      .describe("query=get answer, search=get documents only"),
    userId: z.string().optional().describe("invoking user's Discord ID"),
    guildId: z.string().optional().describe("server ID"),
    username: z.string().optional().describe("invoking user's username"),
  }),

  execute: async ({ query: queryText, category, tags, topK, mode }) => {
    try {
      if (mode === "search") {
        const result = await search(queryText, { category, tags, topK });
        return result.success
          ? {
              results: result.results.map((r) => ({
                text: r.text,
                relevance: r.relevance,
              })),
              totalMatches: result.totalMatches,
            }
          : { error: result.error };
      } else {
        const result = await query(queryText, { topK });
        return result.success
          ? {
              answer: result.answer,
              sources: result.sources,
            }
          : { error: result.error };
      }
    } catch (error) {
      return { error: error.message };
    }
  },
});

initialize().catch((error) => {
  console.error("[KNOWLEDGE BASE] Failed to initialize:", error);
});

export default {
  initialize,
  addDocument,
  addWebPage,
  query,
  search,
  getDocuments,
  deleteDocument,
  getStats,
  reset,
  ragTool,
};
