/**
 * Vector Store using AI SDK's built-in embedding functions
 * Optimized for RAG with cosine similarity search
 */

import { embed, embedMany, cosineSimilarity } from "ai";
import config, { getEmbeddingModel } from "../config.js";

/**
 * In-memory vector store
 * For production, consider using a persistent vector database like Pinecone, Weaviate, or Qdrant
 */
class VectorStore {
  constructor() {
    this.vectors = new Map(); // id -> { embedding, metadata }
    this.embeddingModel = null;
    this.initialized = false;
  }

  /**
   * Initialize the vector store with embedding model
   */
  async initialize() {
    if (this.initialized) return;

    this.embeddingModel = getEmbeddingModel();
    this.initialized = true;
    console.log("[VECTOR STORE] Initialized with embedding model");
  }

  /**
   * Add a single document to the vector store using AI SDK's embed()
   */
  async addDocument(id, text, metadata = {}) {
    await this.initialize();

    try {
      const { embedding } = await embed({
        model: this.embeddingModel,
        value: text,
      });

      this.vectors.set(id, {
        embedding,
        metadata: {
          ...metadata,
          text,
          addedAt: new Date().toISOString(),
        },
      });

      console.log(`[VECTOR STORE] Added document: ${id}`);
      return { success: true, id };
    } catch (error) {
      console.error("[VECTOR STORE] Error adding document:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add multiple documents in batch using AI SDK's embedMany()
   * This is more efficient than calling addDocument multiple times
   */
  async addDocuments(documents) {
    await this.initialize();

    try {
      const texts = documents.map((d) => d.text);
      const { embeddings } = await embedMany({
        model: this.embeddingModel,
        values: texts,
      });

      documents.forEach((doc, index) => {
        this.vectors.set(doc.id, {
          embedding: embeddings[index],
          metadata: {
            ...doc.metadata,
            text: doc.text,
            addedAt: new Date().toISOString(),
          },
        });
      });

      console.log(
        `[VECTOR STORE] Added ${documents.length} documents in batch`,
      );
      return { success: true, count: documents.length };
    } catch (error) {
      console.error("[VECTOR STORE] Error adding documents:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search for similar documents using AI SDK's cosine similarity
   */
  async search(query, options = {}) {
    await this.initialize();

    const {
      topK = config.rag.topK,
      threshold = config.rag.similarityThreshold,
      filter = {},
    } = options;

    try {
      const { embedding: queryEmbedding } = await embed({
        model: this.embeddingModel,
        value: query,
      });

      const results = [];

      for (const [id, { embedding, metadata }] of this.vectors.entries()) {
        if (Object.keys(filter).length > 0) {
          const matches = Object.entries(filter).every(
            ([key, value]) => metadata[key] === value,
          );
          if (!matches) continue;
        }

        const similarity = cosineSimilarity(queryEmbedding, embedding);

        if (similarity >= threshold) {
          results.push({
            id,
            similarity,
            text: metadata.text,
            metadata,
          });
        }
      }

      results.sort((a, b) => b.similarity - a.similarity);
      const topResults = results.slice(0, topK);

      console.log(`[VECTOR STORE] Search found ${topResults.length} results`);

      return {
        success: true,
        query,
        results: topResults,
        totalMatches: results.length,
      };
    } catch (error) {
      console.error("[VECTOR STORE] Search error:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get document by ID
   */
  getDocument(id) {
    const doc = this.vectors.get(id);
    if (!doc) {
      return { success: false, error: "Document not found" };
    }

    return {
      success: true,
      id,
      ...doc,
    };
  }

  /**
   * Delete document by ID
   */
  deleteDocument(id) {
    const existed = this.vectors.has(id);
    this.vectors.delete(id);

    return {
      success: true,
      deleted: existed,
    };
  }

  /**
   * Clear all documents
   */
  clear() {
    const count = this.vectors.size;
    this.vectors.clear();
    console.log(`[VECTOR STORE] Cleared ${count} documents`);

    return { success: true, cleared: count };
  }

  /**
   * Get statistics about the vector store
   */
  getStats() {
    return {
      totalDocuments: this.vectors.size,
      initialized: this.initialized,
      embeddingModel: this.embeddingModel?.modelId || "not initialized",
    };
  }

  /**
   * Export all vectors (for persistence)
   */
  export() {
    return {
      vectors: Array.from(this.vectors.entries()).map(([id, data]) => ({
        id,
        ...data,
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import vectors (from persistence)
   */
  import(data) {
    try {
      this.vectors.clear();

      data.vectors.forEach(({ id, embedding, metadata }) => {
        this.vectors.set(id, { embedding, metadata });
      });

      console.log(`[VECTOR STORE] Imported ${data.vectors.length} vectors`);
      return { success: true, count: data.vectors.length };
    } catch (error) {
      console.error("[VECTOR STORE] Import error:", error);
      return { success: false, error: error.message };
    }
  }
}

const vectorStore = new VectorStore();

export default vectorStore;
