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

    let finalResponse = result.text || "";
    if (result.finishReason === "tool-calls" && result.steps?.length > 0) {
      const lastStep = result.steps[result.steps.length - 1];
      const chatToolCall = lastStep.toolCalls?.find(tc => tc.toolName === "chat");
      
      if (chatToolCall && (!chatToolCall.args || !chatToolCall.args.prompt)) {
        console.log("[AGENT] Calling Gemini and letting Groq orchestrate response...");
        try {
          const geminiRawResponse = await sendPromptTunnel(message);
          if (geminiRawResponse && geminiRawResponse.trim()) {
            console.log("[AGENT] Groq processing Gemini response...");
            const orchestrationResult = await generateText({
              model: getLanguageModel(),
              tools,
              maxSteps: 3,
              prompt: `You are Shantha's response formatter. Gemini generated a response, but it may contain UI noise. Your job:

1. Extract ONLY Shantha's actual spoken response (remove: system prompts, "Gemini is AI and can make mistakes", "About Gemini", "You said", timestamps, UI elements)
2. If the response deserves a rich embed (quotes, lists, important info), call createEmbed tool
3. Return the clean response text

Gemini's raw output:
${geminiRawResponse}

Provide the clean response that should be sent to Discord:`,
            });
            finalResponse = orchestrationResult.text.trim();
            console.log(`[AGENT] Orchestrated response: ${finalResponse.substring(0, 80)}...`);
          }
        } catch (error) {
          console.error("[AGENT] Gemini/orchestration failed:", error);
        }
      }
    }
    
    if ((!finalResponse || finalResponse.trim() === "") && result.steps?.length > 0) {
      for (const step of result.steps) {
        if (step.toolResults && step.toolResults.length > 0) {
          for (const toolResult of step.toolResults) {
            if (toolResult.result) {
              const resultText = toolResult.result.toString();
              
              if (resultText.includes("[RAW_GEMINI_RESPONSE]")) {
                console.log("[AGENT] Found raw Gemini response in tool results, orchestrating...");
                const rawResponse = resultText.replace(/\[RAW_GEMINI_RESPONSE\]|\[\/RAW_GEMINI_RESPONSE\]/g, "").trim();
                
                try {
                  const orchestrationResult = await generateText({
                    model: getLanguageModel(),
                    tools,
                    maxSteps: 3,
                    prompt: `You are Shantha's response formatter. Gemini generated a response, but it may contain UI noise. Your job:

1. Extract ONLY Shantha's actual spoken response (remove: system prompts, "Gemini is AI and can make mistakes", "About Gemini", "You said", timestamps, UI elements)
2. If the response deserves a rich embed (quotes, lists, important info), call createEmbed tool
3. Return the clean response text

Gemini's raw output:
${rawResponse}

Provide the clean response that should be sent to Discord:`,
                  });
                  finalResponse = orchestrationResult.text.trim();
                  console.log(`[AGENT] Orchestrated from tool result: ${finalResponse.substring(0, 80)}...`);
                } catch (error) {
                  console.error("[AGENT] Orchestration failed:", error);
                  finalResponse = rawResponse;
                }
              } else {
                finalResponse = resultText;
              }
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
