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
    let pendingEmbeds = [];

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
      console.log(
        "[AGENT] Tool results available — synthesizing natural response...",
      );

      const collectedEmbeds = [];
      const toolResultsForSynthesis = [];

      for (const step of result.steps) {
        if (step.toolResults) {
          for (const toolResult of step.toolResults) {
            const resultData = toolResult.output || toolResult.result;
            console.log(
              `[AGENT] Tool: ${toolResult.toolName}`,
              JSON.stringify(resultData).substring(0, 100),
            );

            if (toolResult.toolName === "createEmbed" && resultData?.embed) {
              collectedEmbeds.push(resultData.embed);
            } else {
              toolResultsForSynthesis.push({
                tool: toolResult.toolName,
                result: resultData,
              });
            }
          }
        }
      }

      pendingEmbeds = collectedEmbeds;

      if (toolResultsForSynthesis.length > 0) {
        const toolContext = toolResultsForSynthesis
          .map((tr) => `[${tr.tool}]:\n${JSON.stringify(tr.result, null, 2)}`)
          .join("\n\n");

        try {
          const synthesisResult = await generateText({
            model,
            system: `${contextualPrompt}\n\n---\nThe following data has already been fetched via tools. Use it to answer the user naturally. Do NOT call any tools.\n\nTool Results:\n${toolContext}`,
            messages: [...history, { role: "user", content: message }],
            maxSteps: 1,
          });
          finalResponse = synthesisResult.text || "";
          console.log("[AGENT] Synthesized natural response from tool results");
        } catch (err) {
          console.error("[AGENT] Synthesis failed:", err.message);
          finalResponse = toolResultsForSynthesis
            .map((tr) => JSON.stringify(tr.result))
            .join("\n");
        }
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
      embeds: pendingEmbeds,
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
