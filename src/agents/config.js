import dotenv from "dotenv";
dotenv.config();

import { google } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";

const config = {
  apiKeys: {
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    groq: process.env.GROQ_API_KEY,
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
    provider: process.env.AI_MODEL_PROVIDER || "groq",
    name: process.env.AI_MODEL_NAME || "moonshotai/kimi-k2-instruct-0905",
    preset: process.env.AI_MODEL_PRESET || "fast",
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

export function getLanguageModel(
  preset = config.model.preset,
  customModel = null,
) {
  const provider = config.model.provider;
  const modelName = customModel || config.model.name;

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

export function getEmbeddingModel() {
  return google.textEmbeddingModel("text-embedding-004", {
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

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
