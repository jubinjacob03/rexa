/**
 * @file config.js
 * @description Configuration settings and model initialization for the agent.
 */

import dotenv from "dotenv";
dotenv.config();

import { google } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let parsedToolsConfig = {};
try {
  parsedToolsConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, "tools.json"), "utf-8"),
  );
} catch (e) {
  console.warn("Could not parse tools.json");
}

/**
 * Global configuration object.
 */
const config = {
  apiKeys: {
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  tunnel: {
    enabled: process.env.USE_GEMINI_TUNNEL === "true",
    email: process.env.GEMINI_EMAIL,
    password: process.env.GEMINI_PASSWORD,
    headless: process.env.GEMINI_HEADLESS !== "false",
  },

  model: {
    provider: process.env.AI_MODEL_PROVIDER || "openrouter",
    name: process.env.AI_MODEL_NAME || "stepfun/step-3.5-flash:free",
    preset: process.env.AI_MODEL_PRESET || "fast",
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 4000,
  },

  rag: {
    enabled: process.env.RAG_ENABLED !== "false",
    embeddingModel: process.env.EMBEDDING_MODEL || "gemini-embedding-001",
    embeddingDimensions: 3072,
    topK: parseInt(process.env.RAG_TOP_K) || 5,
    similarityThreshold:
      parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.7,
    maxContextLength: parseInt(process.env.RAG_MAX_CONTEXT_LENGTH) || 50,
  },

  commandExecution: {
    enabled: process.env.COMMAND_EXECUTION_ENABLED !== "false",
    blockedCommands: (
      process.env.BLOCKED_COMMANDS ||
      "ban,kick,delete-channel,setup-verification"
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

  agentTools: parsedToolsConfig,

  security: {
    allowSensitiveOps: process.env.ALLOW_SENSITIVE_OPS === "true",
    requireConfirmation: process.env.REQUIRE_CONFIRMATION !== "false",
  },
};

/**
 * Retrieves the configured language model instance.
 * @param {string} [preset=config.model.preset] - The model preset to use.
 * @param {string|null} [customModel=null] - A custom model name to override the preset.
 * @returns {object} The initialized language model.
 */
export function getLanguageModel(
  preset = config.model.preset,
  customModel = null,
) {
  const provider = config.model.provider;
  const modelName = customModel || config.model.name;

  if (provider === "openrouter") {
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });

    const openrouterModels = {
      fast: "stepfun/step-3.5-flash:free",
      balanced: "stepfun/step-3.5-flash:free",
      powerful: "stepfun/step-3.5-flash:free",
      creative: "stepfun/step-3.5-flash:free",
    };

    const model = preset !== "custom" ? openrouterModels[preset] : modelName;

    return openrouter.chat(model || "stepfun/step-3.5-flash:free", {
      temperature: config.model.temperature,
    });
  }

  if (provider === "groq") {
    const groq = createGroq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const groqModels = {
      fast: "moonshotai/kimi-k2-instruct-0905",
      balanced: "moonshotai/kimi-k2-instruct-0905",
      powerful: "moonshotai/kimi-k2-instruct-0905",
      creative: "moonshotai/kimi-k2-instruct-0905",
    };

    const model = preset !== "custom" ? groqModels[preset] : modelName;

    return groq(model || "moonshotai/kimi-k2-instruct-0905", {
      temperature: config.model.temperature,
    });
  }

  const geminiModels = {
    fast: "gemini-2.5-flash-lite",
    balanced: "gemini-2.5-flash",
    powerful: "gemini-2.5-pro",
    creative: "gemini-2.5-flash",
  };

  const model = preset !== "custom" ? geminiModels[preset] : modelName;

  return google(model || "gemini-2.5-flash-lite", {
    temperature: config.model.temperature,
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

/**
 * Retrieves the configured embedding model instance.
 * @returns {object} The initialized embedding model.
 */
export function getEmbeddingModel() {
  return google.textEmbeddingModel("gemini-embedding-001", {
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

/**
 * Retrieves the configured image generation model settings.
 * @returns {object} The image model configuration.
 * @throws {Error} If the configured image provider is unknown.
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
