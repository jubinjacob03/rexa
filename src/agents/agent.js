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

async function getSystemPromptWithoutTools() {
  const [master, music, creative, moderation, welcome, info] =
    await Promise.all([
      loadPrompt("master-agent"),
      loadPrompt("music-context"),
      loadPrompt("creative-context"),
      loadPrompt("moderation-context"),
      loadPrompt("welcome-context"),
      loadPrompt("info-context"),
    ]);

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

async function getSystemPrompt() {
  const [base, toolsCtx] = await Promise.all([
    getSystemPromptWithoutTools(),
    loadPrompt("tools-context"),
  ]);
  return `${base}\n\n---\n\n${toolsCtx}`;
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
    loadPrompt("tools-context"),
  ]);

  agentInitialized = true;
  console.log("[AGENT] Initialized successfully");
  return { processMessage, executeCommand, getStats };
}

const MUSIC_INFO_ACTIONS = new Set(["nowplaying", "queue"]);

const ACTION_ONLY_TOOLS = new Set(["executeCommand", "executeWorkflow"]);

const MUSIC_CONFIRMATIONS = {
  play: "▶️ On it!",
  pause: "⏸️ Paused.",
  resume: "▶️ Resumed.",
  skip: "⏭️ Skipped.",
  stop: "⏹️ Stopped.",
  volume: "🔊 Volume updated.",
};

function extractToolCall(text) {
  // Try JSON format: {"tool_call": {"name": "...", "params": {...}}}
  const stripped = text.replace(/```(?:json)?\s*\n?/gi, "").trim();
  const idx = stripped.indexOf('{"tool_call"');
  if (idx !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = idx; i < stripped.length; i++) {
      if (stripped[i] === "{") depth++;
      else if (stripped[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) {
      try {
        const parsed = JSON.parse(stripped.slice(idx, end + 1));
        if (parsed.tool_call?.name) return parsed.tool_call;
      } catch {}
    }
  }

  // Try XML format emitted by stepfun: <tool_call><function=NAME><parameter=KEY>VAL</parameter></function></tool_call>
  if (text.includes("<tool_call>") || text.includes("<function=")) {
    const funcMatch = text.match(/<function=(\w+)>/);
    if (funcMatch) {
      const toolName = funcMatch[1];
      const params = {};
      const paramRegex = /<parameter=(\w+)>\s*([\s\S]*?)\s*<\/parameter>/g;
      let m;
      while ((m = paramRegex.exec(text)) !== null) {
        const key = m[1];
        const val = m[2].trim();
        const isSmallInt =
          val !== "" &&
          /^\d+$/.test(val) &&
          BigInt(val) <= BigInt(Number.MAX_SAFE_INTEGER);
        params[key] = isSmallInt ? Number(val) : val;
      }
      return { name: toolName, params };
    }
  }

  return null;
}

async function executeToolByName(toolName, params) {
  try {
    const toolObj = tools[toolName];
    if (!toolObj?.execute) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }
    const result = await toolObj.execute(params);
    return result ?? { success: true };
  } catch (err) {
    console.error(`[AGENT] Tool execution error (${toolName}):`, err);
    return { success: false, error: err.message };
  }
}

export async function processMessage(userId, guildId, message) {
  console.log(`[AGENT] Processing message from user ${userId}`);

  try {
    const history = contextManager.getFormattedHistory(userId, guildId, 10);
    const pass1History = history.filter((m) => m.role === "user");
    const [systemPrompt, systemPromptNoTools] = await Promise.all([
      getSystemPrompt(),
      getSystemPromptWithoutTools(),
    ]);
    const model = getLanguageModel();

    const currentContext = `\n\n## Current Context\n\n- **User ID**: \`${userId}\`\n- **Guild ID**: \`${guildId}\`\n- **Note**: When calling musicControl or any tool that requires userId/guildId, use the values above.\n- **CRITICAL**: Conversation history may contain old/stale responses. For ANY question about server members, roles, or live server data — you MUST call the appropriate tool right now to get fresh data. Never rely on previous responses in the conversation history for this.`;
    const contextualPrompt = `${systemPrompt}${currentContext}`;
    const contextualPromptNoTools = `${systemPromptNoTools}${currentContext}`;

    // Pass 1: model decides whether to call a tool or answer directly
    const pass1 = await generateText({
      model,
      system: contextualPrompt,
      messages: [...pass1History, { role: "user", content: message }],
      maxSteps: 1,
    });

    const rawOutput = (pass1.text || "").trim();
    console.log(
      `[AGENT] Pass 1 output (${pass1.finishReason}): ${rawOutput.substring(0, 150)}`,
    );

    const toolCall = extractToolCall(rawOutput);

    if (!toolCall) {
      console.log("[AGENT] No tool call — using direct response");
      await contextManager.addMessage(userId, guildId, "user", message);
      await contextManager.addMessage(userId, guildId, "assistant", rawOutput);
      return { success: true, response: rawOutput, embeds: [] };
    }

    const { name: toolName, params: toolParams = {} } = toolCall;
    console.log(
      `[AGENT] Tool call: ${toolName}`,
      JSON.stringify(toolParams).substring(0, 120),
    );

    const enrichedParams = { ...toolParams, userId, guildId };

    let toolResult = await executeToolByName(toolName, enrichedParams);
    if (toolName === "serverInfo" && toolParams.infoType === "members") {
      const personMatch = message.match(
        /(?:who\s+is|do\s+you\s+know|find|tell\s+me\s+about|what(?:'s|\s+is)(?:\s+up\s+with)?)\s+([\w.\-]+)/i,
      );
      if (personMatch) {
        const searchTerm = personMatch[1].trim();
        console.log(
          `[AGENT] Redirecting infoType=members → search for: "${searchTerm}"`,
        );
        const searchResult = await executeToolByName("serverInfo", {
          ...enrichedParams,
          infoType: "search",
          searchQuery: searchTerm,
        });
        if (searchResult?.success && searchResult.results?.length > 0) {
          toolResult = searchResult;
          enrichedParams.infoType = "search";
          enrichedParams.searchQuery = searchTerm;
          console.log(
            `[AGENT] Redirected search result: ${JSON.stringify(searchResult).substring(0, 100)}`,
          );
        }
      }
    }

    console.log(
      `[AGENT] Tool result (${toolName}):`,
      JSON.stringify(toolResult).substring(0, 150),
    );

    let finalToolName = toolName;
    let finalToolResult = toolResult;
    if (
      toolName === "serverInfo" &&
      enrichedParams.infoType === "search" &&
      toolResult?.success &&
      (toolResult.count === 0 || toolResult.results?.length === 0)
    ) {
      console.log("[AGENT] serverInfo returned no results — trying ragQuery");
      const ragResult = await executeToolByName("ragQuery", {
        query: enrichedParams.searchQuery,
        userId,
        guildId,
      });
      const ragHasContent =
        ragResult?.success &&
        ragResult.answer &&
        !ragResult.answer.toLowerCase().includes("no relevant") &&
        !ragResult.answer.toLowerCase().includes("couldn't find");

      if (ragHasContent) {
        finalToolName = "ragQuery";
        finalToolResult = ragResult;
        console.log("[AGENT] Identity fallback: using ragQuery result");
      } else {
        console.log("[AGENT] ragQuery empty — trying webSearch");
        const webResult = await executeToolByName("webSearch", {
          query: `${enrichedParams.searchQuery} site:discord.com OR gamer OR streamer`,
          userId,
          guildId,
        });
        if (webResult?.success) {
          finalToolName = "webSearch";
          finalToolResult = webResult;
          console.log("[AGENT] Identity fallback: using webSearch result");
        }
      }
    }

    if (finalToolName === "createEmbed") {
      const embeds = finalToolResult?.embed ? [finalToolResult.embed] : [];
      const errMsg =
        finalToolResult?.success === false
          ? finalToolResult.error || "Couldn't create the embed."
          : "";
      await contextManager.addMessage(userId, guildId, "user", message);
      await contextManager.addMessage(
        userId,
        guildId,
        "assistant",
        errMsg || "[embed]",
      );
      return { success: true, response: errMsg, embeds };
    }

    if (ACTION_ONLY_TOOLS.has(finalToolName)) {
      const finalResp =
        finalToolResult?.success === false
          ? finalToolResult.error || "Sorry, that didn't work."
          : "✅ Done!";
      await contextManager.addMessage(userId, guildId, "user", message);
      await contextManager.addMessage(userId, guildId, "assistant", finalResp);
      return { success: true, response: finalResp, embeds: [] };
    }

    if (
      finalToolName === "musicControl" &&
      !MUSIC_INFO_ACTIONS.has(toolParams.action)
    ) {
      const finalResp =
        finalToolResult?.success === false
          ? finalToolResult.error || "Sorry, that didn't work."
          : MUSIC_CONFIRMATIONS[toolParams.action] || "✅ Done!";
      await contextManager.addMessage(userId, guildId, "user", message);
      await contextManager.addMessage(userId, guildId, "assistant", finalResp);
      return { success: true, response: finalResp, embeds: [] };
    }

    // Pass 2: feed tool result back for natural language synthesis
    const toolContext = `[${finalToolName} result]:\n${JSON.stringify(finalToolResult, null, 2)}`;

    const pass2 = await generateText({
      model,
      system: `${contextualPromptNoTools}\n\n---\nYou just retrieved the following data to answer the user's question. Think carefully about what the user actually asked, then give a concise, natural, conversational answer using only the relevant parts of this data. Do NOT dump raw lists or JSON — synthesize the information into a helpful response as if you already know it. Do NOT call any tools or output any tool_call XML.\n\n${toolContext}`,
      messages: [{ role: "user", content: message }],
      maxSteps: 1,
    });

    let finalResponse = (pass2.text || "").trim();
    // Strip any XML tool call the model may have emitted in Pass 2
    const xmlIdx = finalResponse.indexOf("<tool_call>");
    const funcIdx = finalResponse.indexOf("<function=");
    const cutIdx =
      xmlIdx !== -1 && funcIdx !== -1
        ? Math.min(xmlIdx, funcIdx)
        : Math.max(xmlIdx, funcIdx);
    if (cutIdx !== -1) {
      finalResponse = finalResponse.substring(0, cutIdx).trim();
      if (!finalResponse)
        finalResponse =
          "I looked into it but couldn't get the information right now. Please try again!";
    }
    console.log(
      `[AGENT] Pass 2 synthesized: ${finalResponse.substring(0, 120)}`,
    );

    await contextManager.addMessage(userId, guildId, "user", message);
    await contextManager.addMessage(
      userId,
      guildId,
      "assistant",
      finalResponse,
    );
    return { success: true, response: finalResponse, embeds: [] };
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
  return await tools.executeCommand.execute({
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
