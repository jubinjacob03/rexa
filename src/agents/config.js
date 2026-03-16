/**
 * Agent Configuration
 * All settings for Shantha AI Agent including model configuration
 */

import dotenv from "dotenv";
dotenv.config();

import { google } from "@ai-sdk/google";

const config = {
  apiKeys: {
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  model: {
    provider: process.env.AI_MODEL_PROVIDER || "google",
    name: process.env.AI_MODEL_NAME || "gemini-3-flash-preview",
    preset: process.env.AI_MODEL_PRESET || "balanced",
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 2000,
  },

  rag: {
    enabled: process.env.RAG_ENABLED !== "false",
    embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-004",
    embeddingDimensions: 768,
    topK: parseInt(process.env.RAG_TOP_K) || 5,
    similarityThreshold:
      parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.7,
    maxContextLength: parseInt(process.env.RAG_MAX_CONTEXT_LENGTH) || 50,
  },

  commandExecution: {
    enabled: process.env.COMMAND_EXECUTION_ENABLED !== "false",
    blockedCommands: (
      process.env.BLOCKED_COMMANDS || "ban,kick,delete-channel"
    ).split(","),
    maxStepsPerMinute: parseInt(process.env.COMMAND_MAX_STEPS) || 10,
  },

  imageGeneration: {
    enabled: process.env.IMAGE_GENERATION_ENABLED !== "false",
    provider: process.env.IMAGE_PROVIDER || "google",
    model: process.env.IMAGE_MODEL || "imagen-4.0-fast-generate-001",
    defaultStyle: process.env.IMAGE_DEFAULT_STYLE || "digital-art",
    backupProvider: "pollinations",
  },

  security: {
    allowSensitiveOps: process.env.ALLOW_SENSITIVE_OPS === "true",
    requireConfirmation: process.env.REQUIRE_CONFIRMATION !== "false",
  },
};

/**
 * Get language model based on configuration
 */
export function getLanguageModel(
  preset = config.model.preset,
  customModel = null,
) {
  const modelName = customModel || config.model.name;

  // March 2026 Free Tier Models
  const presets = {
    fast: "gemini-2.5-flash-lite",
    balanced: "gemini-2.5-flash",
    powerful: "gemini-2.5-pro",
    creative: "gemini-2.5-flash",
  };

  const model = preset !== "custom" ? presets[preset] : modelName;

  return google(model || "gemini-2.5-flash-lite", {
    temperature: config.model.temperature,
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

/**
 * Get embedding model
 */
export function getEmbeddingModel() {
  return google.textEmbeddingModel("text-embedding-004", {
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

/**
 * Get image model
 */
export function getImageModel() {
  const provider = config.imageGeneration.provider;

  if (provider === "google") {
    return {
      provider: "google",
      model: config.imageGeneration.model,
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    };
  } else if (provider === "pollinations") {
    return {
      provider: "pollinations",
      endpoint: "https://image.pollinations.ai/prompt/",
    };
  }

  throw new Error(`Unknown image provider: ${provider}`);
}

export default config;
