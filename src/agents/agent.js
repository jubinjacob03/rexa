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

async function loadPrompt(promptName, useCache = true) {
  if (useCache && promptCache.has(promptName)) {
    return promptCache.get(promptName);
  }

  const promptPath = path.join(__dirname, "prompts", `${promptName}.md`);
  const content = await fs.readFile(promptPath, "utf-8");
  promptCache.set(promptName, content);
  return content;
}

async function getSystemPrompt(context = null) {
  let prompt = await loadPrompt("master-agent");

  if (context) {
    const contextPrompt = await loadPrompt(`${context}-context`);
    prompt += `\n\n---\n\n${contextPrompt}`;
  }

  return prompt;
}

let agentInitialized = false;

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

    console.log(`[AGENT] Result - finishReason: ${result.finishReason}, text: ${result.text ? result.text.substring(0, 50) : 'none'}, steps: ${result.steps?.length || 0}`);

    let finalResponse = result.text || "";
    
    if ((!finalResponse || finalResponse.trim() === "") && result.steps?.length > 0) {
      console.log(`[AGENT] Extracting from ${result.steps.length} steps...`);
      for (const step of result.steps) {
        console.log(`[AGENT] Step - toolCalls: ${step.toolCalls?.length || 0}, toolResults: ${step.toolResults?.length || 0}`);
        if (step.toolResults && step.toolResults.length > 0) {
          for (const toolResult of step.toolResults) {
            console.log(`[AGENT] Tool result - toolName: ${toolResult.toolName}, result length: ${toolResult.result?.toString().length || 0}`);
            if (toolResult.result) {
              finalResponse = toolResult.result.toString();
              console.log(`[AGENT] Using tool result as final response (${finalResponse.length} chars)`);
              break;
            }
          }
        }
        if (finalResponse) break;
      }
    }

    if (!finalResponse || finalResponse.trim() === "") {
      console.warn("[AGENT] Empty response generated");
    }

    await contextManager.addMessage(userId, guildId, "assistant", finalResponse);

    return {
      success: true,
      response: finalResponse,
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

export async function executeCommand(command, params, userId, guildId) {
  return await tools.commandExecutorTool.execute({
    command,
    parameters: params,
    userId,
    guildId,
  });
}

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
