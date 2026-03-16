/**
 * Agent Configuration
 * All settings for Shantha AI Agent including model configuration
 */

import dotenv from 'dotenv';
dotenv.config();

import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

const config = {
  apiKeys: {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  model: {
    provider: process.env.AI_MODEL_PROVIDER || 'google',
    name: process.env.AI_MODEL_NAME || 'gemini-2.5-flash',
    preset: process.env.AI_MODEL_PRESET || 'balanced',
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 2000,
  },

  rag: {
    enabled: process.env.RAG_ENABLED !== 'false',
    embeddingModel: process.env.EMBEDDING_MODEL || 'embedding-001',
    embeddingDimensions: 768,
    topK: parseInt(process.env.RAG_TOP_K) || 5,
    similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.7,
    maxContextLength: parseInt(process.env.RAG_MAX_CONTEXT_LENGTH) || 50,
  },

  commandExecution: {
    enabled: process.env.COMMAND_EXECUTION_ENABLED !== 'false',
    blockedCommands: (process.env.BLOCKED_COMMANDS || 'ban,kick,delete-channel').split(','),
    maxStepsPerMinute: parseInt(process.env.COMMAND_MAX_STEPS) || 10,
  },

  imageGeneration: {
    enabled: process.env.IMAGE_GENERATION_ENABLED === 'true',
    model: process.env.IMAGE_MODEL || 'dall-e-3',
    defaultStyle: process.env.IMAGE_DEFAULT_STYLE || 'digital-art',
  },

  security: {
    allowSensitiveOps: process.env.ALLOW_SENSITIVE_OPS === 'true',
    requireConfirmation: process.env.REQUIRE_CONFIRMATION !== 'false',
  },
};

/**
 * Get language model based on configuration
 */
export function getLanguageModel(preset = config.model.preset, customModel = null) {
  const modelName = customModel || config.model.name;
  
  const presets = {
    fast: { openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku-20241022', google: 'gemini-2.5-flash-lite' },
    balanced: { openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022', google: 'gemini-2.5-flash' },
    powerful: { openai: 'gpt-4o', anthropic: 'claude-sonnet-4-20250514', google: 'gemini-3-flash-preview' },
    creative: { openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022', google: 'gemini-2.5-flash' },
  };

  const model = preset !== 'custom' ? presets[preset]?.[config.model.provider] : modelName;

  switch (config.model.provider) {
    case 'openai':
      return openai(model || 'gpt-4o', { temperature: config.model.temperature });
    case 'anthropic':
      return anthropic(model || 'claude-3-5-sonnet-20241022', { temperature: config.model.temperature });
    case 'google':
      return google(model || 'gemini-1.5-pro', { 
        temperature: config.model.temperature,
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
      });
    default:
      throw new Error(`Unknown provider: ${config.model.provider}`);
  }
}

/**
 * Get embedding model
 */
export function getEmbeddingModel() {
  switch (config.model.provider) {
    case 'openai':
      return openai.embedding(config.rag.embeddingModel);
    case 'anthropic':
      return google.textEmbeddingModel('embedding-001', {
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
      });
    case 'google':
      return google.textEmbeddingModel('embedding-001', {
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
      });
    default:
      return google.textEmbeddingModel('embedding-001', {
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY
      });
  }
}

/**
 * Get image model
 */
export function getImageModel() {
  return openai.image(config.imageGeneration.model);
}

export default config;
