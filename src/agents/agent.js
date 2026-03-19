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

async function getSystemPrompt() {
  // Load master prompt + all context prompts
  // The AI will naturally use the relevant sections based on the situation
  const [master, music, creative, moderation, welcome, info] =
    await Promise.all([
      loadPrompt("master-agent"),
      loadPrompt("music-context"),
      loadPrompt("creative-context"),
      loadPrompt("moderation-context"),
      loadPrompt("welcome-context"),
      loadPrompt("info-context"),
    ]);

  // Combine all contexts - AI will intelligently use what's relevant
  return `${master}

---

## 🎵 Music & Entertainment Capabilities
${music}

---

## 🎨 Creative & Content Generation
${creative}

---

## 🛡️ Moderation & Server Management
${moderation}

---

## 👋 Welcome & Onboarding
${welcome}

---

## 📚 Information & Help
${info}`;
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

export async function processMessage(userId, guildId, message) {
  console.log(`[AGENT] Processing message from user ${userId}`);

  try {
    // Get history BEFORE adding current message to avoid duplication
    const history = contextManager.getFormattedHistory(userId, guildId, 10);
    const systemPrompt = await getSystemPrompt();
    const model = getLanguageModel();

    const contextualPrompt = `${systemPrompt}

## Current Context

- **User ID**: \`${userId}\`
- **Guild ID**: \`${guildId}\`
- **Note**: When using tools that require \`userId\`, \`guildId\`, or \`targetId\`, use these values above.`;

    const result = await generateText({
      model,
      system: contextualPrompt,
      messages: [...history, { role: "user", content: message }],
      tools,
      maxSteps: config.commandExecution.maxStepsPerMinute || 5,
    });

    console.log(
      `[AGENT] Result - finishReason: ${result.finishReason}, text: ${result.text ? result.text.substring(0, 50) : "none"}, steps: ${result.steps?.length || 0}`,
    );

    let finalResponse = result.text || "";

    // When finishReason is 'tool-calls', the model made a tool call but its post-tool
    // LLM pass returned empty. result.text only has the pre-tool "I'll check" text.
    // We must override it with the actual tool results from the steps.
    const toolWasExecuted = result.steps?.some(
      (s) => s.toolResults?.length > 0,
    );
    const shouldUseToolResults =
      toolWasExecuted &&
      (result.finishReason === "tool-calls" ||
        !finalResponse ||
        finalResponse.trim() === "");

    if (shouldUseToolResults) {
      if (result.finishReason === "tool-calls" && finalResponse) {
        console.log(
          "[AGENT] finishReason=tool-calls with pre-tool text — overriding with tool results...",
        );
      } else {
        console.log(
          "[AGENT] No text response but have tool results, formatting...",
        );
      }
      const toolResults = [];

      for (const step of result.steps) {
        if (step.toolResults) {
          for (const toolResult of step.toolResults) {
            console.log(
              `[AGENT] Tool result structure:`,
              JSON.stringify(toolResult, null, 2).substring(0, 200),
            );
            toolResults.push({
              tool: toolResult.toolName,
              args: toolResult.args,
              result: toolResult.output || toolResult.result,
            });
          }
        }
      }

      if (toolResults.length > 0) {
        const formattedResults = toolResults
          .map((tr) => {
            const resultData = tr.result;

            if (resultData && typeof resultData === "object") {
              if (resultData.success === false) {
                return `**${tr.tool}**: ❌ Error: ${resultData.error || "Failed"}`;
              }

              if (tr.tool === "serverInfo") {
                if (resultData.username) {
                  const parts = [
                    `👤 **User**: ${resultData.displayName || resultData.username}`,
                    resultData.roles?.length > 0
                      ? `🎭 **Roles**: ${resultData.roles.join(", ")}`
                      : null,
                    resultData.status
                      ? `🟢 **Status**: ${resultData.status}`
                      : null,
                    resultData.memberCount
                      ? `👥 **Members**: ${resultData.memberCount}`
                      : null,
                  ].filter(Boolean);
                  return parts.join("\n");
                } else if (resultData.serverName) {
                  return `🏰 **Server**: ${resultData.serverName}\n👥 **Members**: ${resultData.memberCount || "Unknown"}`;
                }
              } else if (tr.tool === "ragQuery") {
                if (resultData.context) {
                  return `📚 **Knowledge**: ${resultData.context.substring(0, 300)}...`;
                }
              } else if (tr.tool === "createEmbed") {
                return `✅ **Embed created**: ${resultData.preview || "Success"}`;
              } else if (tr.tool === "webSearch") {
                if (resultData.results?.length > 0) {
                  return `🔍 **Search Results**:\n${resultData.results
                    .slice(0, 3)
                    .map((r) => `• ${r.title}`)
                    .join("\n")}`;
                }
              }

              return `**${tr.tool}**: ${JSON.stringify(resultData, null, 2)}`;
            }
            return `**${tr.tool}**: ${resultData}`;
          })
          .join("\n\n");

        finalResponse = formattedResults;
        console.log("[AGENT] Formatted tool results into response");
      }
    }

    if (!finalResponse || finalResponse.trim() === "") {
      console.warn(
        "[AGENT] Empty response generated even after tool result formatting",
      );
    }

    await contextManager.addMessage(userId, guildId, "user", message);
    await contextManager.addMessage(
      userId,
      guildId,
      "assistant",
      finalResponse,
    );

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
