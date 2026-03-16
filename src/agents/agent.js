/**
 * Shantha AI Agent - Main orchestration file
 */

import { generateText } from "ai";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import config, { getLanguageModel } from "./config.js";
import {
  tools,
  initializeTools,
  knowledgeBase,
  contextManager,
} from "./tools/index.js";
import { sendPromptTunnel } from "./gemini-web-tunnel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const promptCache = new Map();

/**
 * Load prompt from markdown file
 */
async function loadPrompt(promptName, useCache = true) {
  if (useCache && promptCache.has(promptName)) {
    return promptCache.get(promptName);
  }

  const promptPath = path.join(__dirname, "prompts", `${promptName}.md`);
  const content = await fs.readFile(promptPath, "utf-8");
  promptCache.set(promptName, content);
  return content;
}

/**
 * Get system prompt with optional context
 */
async function getSystemPrompt(context = null) {
  let prompt = await loadPrompt("master-agent");

  if (context) {
    const contextPrompt = await loadPrompt(`${context}-context`);
    prompt += `\n\n---\n\n${contextPrompt}`;
  }

  return prompt;
}

let agentInitialized = false;

/**
 * Initialize agent system
 */
export async function initializeAgent(client) {
  if (agentInitialized) {
    console.log("[AGENT] Already initialized, skipping");
    return { processMessage, executeCommand, getStats };
  }

  await initializeTools(client);

  await Promise.all([
    loadPrompt("master-agent"),
    loadPrompt("music-context"),
    loadPrompt("moderation-context"),
    loadPrompt("welcome-context"),
    loadPrompt("creative-context"),
    loadPrompt("info-context"),
  ]);

  agentInitialized = true;
  console.log("[AGENT] Initialized successfully");
  return { processMessage, executeCommand, getStats };
}

/**
 * Process user message
 */
export async function processMessage(userId, guildId, message, context = null) {
  console.log(`[AGENT] Processing message from user ${userId}`);

  try {
    await contextManager.addMessage(userId, guildId, "user", message);

    const history = contextManager.getFormattedHistory(userId, guildId, 10);
    const systemPrompt = await getSystemPrompt(context);
    const model = getLanguageModel();

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [...history, { role: "user", content: message }],
      tools,
      maxSteps: config.commandExecution.maxStepsPerMinute || 5,
    });

    console.log(`[AGENT] Response text length: ${result.text?.length || 0}`);
    console.log(`[AGENT] Finish reason: ${result.finishReason}`);
    console.log(`[AGENT] Steps count: ${result.steps?.length || 0}`);

    if (!result.text || result.text.trim() === "") {
      console.warn("[AGENT] Empty response generated!");
      console.log(
        `[AGENT] Full result:`,
        JSON.stringify(
          {
            text: result.text,
            finishReason: result.finishReason,
            usage: result.usage,
          },
          null,
          2,
        ),
      );
    }

    await contextManager.addMessage(userId, guildId, "assistant", result.text);

    return {
      success: true,
      response: result.text,
      toolCalls: result.steps?.filter((s) => s.toolCalls?.length > 0) || [],
      finishReason: result.finishReason,
    };
  } catch (error) {
    console.error("[AGENT] Error:", error);
    return {
      success: false,
      error: error.message,
      response: "Sorry, I encountered an error. Please try again later.",
    };
  }
}

/**
 * Execute command directly
 */
export async function executeCommand(command, params, userId, guildId) {
  return await tools.commandExecutorTool.execute({
    command,
    parameters: params,
    userId,
    guildId,
  });
}

/**
 * Get statistics
 */
export function getStats() {
  return {
    knowledgeBase: knowledgeBase.getStats(),
    contextManager: contextManager.getStats(),
    config: {
      model: config.model.provider,
      ragEnabled: config.rag.enabled,
      commandExecution: config.commandExecution.enabled,
    },
  };
}

/**
 * Initialize the complete agent system
 */
export async function initializeAgentSystem(discordClient) {
  console.log("[AGENT SYSTEM] Initializing...");

  const agent = await initializeAgent(discordClient);

  console.log(
    `[AGENT SYSTEM] Model: ${config.model.provider} - ${config.model.name}`,
  );
  console.log(
    `[AGENT SYSTEM] RAG: ${config.rag.enabled ? "Enabled" : "Disabled"}`,
  );
  console.log(
    `[AGENT SYSTEM] Commands: ${config.commandExecution.enabled ? "Enabled" : "Disabled"}`,
  );

  return agent;
}

export { knowledgeBase, contextManager, config };

export default {
  initializeAgentSystem,
  initializeAgent,
  processMessage,
  executeCommand,
  getStats,
};
