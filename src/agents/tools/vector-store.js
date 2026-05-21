/**
 * @file vector-store.js
 * @description Vector Store using AI SDK's built-in embedding functions. Optimized for RAG with cosine similarity search.
 */

import { embed, embedMany, cosineSimilarity } from "ai";
import config, { getEmbeddingModel } from "../config.js";

/**
 * In-memory vector store.
 * For production, consider using a persistent vector database like Pinecone, Weaviate, or Qdrant.
 */
class VectorStore {
  /**
   * Creates an instance of VectorStore.
   */
  constructor() {
    this.vectors = new Map();
    this.embeddingModel = null;
    this.initialized = false;
  }

  /**
   * Initializes the vector store with the embedding model.
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    this.embeddingModel = getEmbeddingModel();
    this.initialized = true;
    console.log("[VECTOR STORE] Initialized with embedding model");
  }

  /**
   * Adds a single document to the vector store using AI SDK's embed().
   * @param {string} id - The document ID.
   * @param {string} text - The document text.
   * @param {object} [metadata={}] - Additional metadata.
   * @returns {Promise<object>} The result of the operation.
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
   * Adds multiple documents in batch using AI SDK's embedMany().
   * This is more efficient than calling addDocument multiple times.
   * @param {Array<object>} documents - The documents to add.
   * @returns {Promise<object>} The result of the operation.
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
   * Searches for similar documents using AI SDK's cosine similarity.
   * @param {string} query - The search query.
   * @param {object} [options={}] - Search options.
   * @param {number} [options.topK] - Number of top results to return.
   * @param {number} [options.threshold] - Similarity threshold.
   * @param {object} [options.filter={}] - Metadata filter.
   * @returns {Promise<object>} The search results.
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
   * Gets a document by ID.
   * @param {string} id - The document ID.
   * @returns {object} The document data.
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
   * Deletes a document by ID.
   * @param {string} id - The document ID.
   * @returns {object} The result of the deletion.
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
   * Clears all documents from the vector store.
   * @returns {object} The result of the clear operation.
   */
  clear() {
    const count = this.vectors.size;
    this.vectors.clear();
    console.log(`[VECTOR STORE] Cleared ${count} documents`);

    return { success: true, cleared: count };
  }

  /**
   * Gets statistics about the vector store.
   * @returns {object} The statistics.
   */
  getStats() {
    return {
      totalDocuments: this.vectors.size,
      initialized: this.initialized,
      embeddingModel: this.embeddingModel?.modelId || "not initialized",
    };
  }

  /**
   * Exports all vectors (for persistence).
   * @returns {object} The exported data.
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
   * Imports vectors (from persistence).
   * @param {object} data - The data to import.
   * @returns {object} The result of the import operation.
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
