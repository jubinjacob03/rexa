/**
 * @file agent.js
 * @description Core agent logic for processing messages, executing tools, and managing prompts.
 */

import { generateText } from "ai";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import config, { getLanguageModel } from "./config.js";
import { icon } from "../utils/icons.js";
import {
  tools,
  initializeTools,
  knowledgeBase,
  contextManager,
} from "./tools/index.js";
import {
  extractToolCall,
  RE_FOLLOW_UP_PRONOUNS,
  RE_FOLLOW_UP_WORDS,
  RE_LOOKS_LIKE_TOOL,
  RE_XML_TOOL_BLEED,
  RE_XML_CUT,
  RE_JSON_CUT,
  RE_PY_FUNC_CUT,
  RE_PERSON_MATCH,
  RE_WTTR_MATCH,
  RE_TIME_QUERY,
  ACTION_ONLY_TOOLS,
  MUSIC_INFO_ACTIONS,
  getMusicConfirmation,
  initEmojis,
} from "./utils/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const promptCache = new Map();

let _cachedBasePrompt = null;
let _cachedFullPrompt = null;
let _cachedPass1Base = null;
let _cachedPass2Base = null;
let _model = null;

/**
 * Loads a prompt from the file system, utilizing a cache to avoid repeated reads.
 * @param {string} promptName - The name of the prompt file (without extension).
 * @param {boolean} [useCache=true] - Whether to use the cached prompt if available.
 * @returns {Promise<string>} The content of the prompt.
 */
async function loadPrompt(promptName, useCache = true) {
  if (useCache && promptCache.has(promptName)) {
    return promptCache.get(promptName);
  }

  const promptPath = path.join(__dirname, "prompts", `${promptName}.md`);
  let content = await fs.readFile(promptPath, "utf-8");

  if (promptName === "tools" || promptName === "master") {
    content = await filterToolsContext(content);
  }

  promptCache.set(promptName, content);
  return content;
}

/**
 * Filters out disabled tools from the prompt context based on tools.json configuration.
 * @param {string} content - The raw prompt content.
 * @returns {Promise<string>} The filtered prompt content.
 */
async function filterToolsContext(content) {
  let toolsConfig;
  try {
    const configPath = path.join(__dirname, "tools.json");
    const fileContent = await fs.readFile(configPath, "utf-8");
    toolsConfig = JSON.parse(fileContent);
  } catch {
    return content;
  }

  let filteredContent = content;

  for (const [toolName, isEnabled] of Object.entries(toolsConfig)) {
    if (isEnabled === false) {
      const ruleRegex = new RegExp(
        `<!-- RULE:${toolName} -->[\\s\\S]*?<!-- END_RULE:${toolName} -->\\n?`,
        "g",
      );
      filteredContent = filteredContent.replace(ruleRegex, "");

      const defRegex = new RegExp(
        `<!-- DEF:${toolName} -->[\\s\\S]*?<!-- END_DEF:${toolName} -->\\n?`,
        "g",
      );
      filteredContent = filteredContent.replace(defRegex, "");
    }
  }

  return filteredContent;
}

/**
 * Retrieves the base system prompt without tool definitions.
 * @returns {Promise<string>} The base system prompt.
 */
async function getSystemPromptWithoutTools() {
  if (_cachedBasePrompt) return _cachedBasePrompt;
  const [personality, master] = await Promise.all([
    loadPrompt("personality"),
    loadPrompt("master"),
  ]);

  _cachedBasePrompt = `${personality}\n\n---\n\n${master}`;
  return _cachedBasePrompt;
}

/**
 * Retrieves the full system prompt including tool definitions.
 * @returns {Promise<string>} The full system prompt.
 */
async function getSystemPrompt() {
  if (_cachedFullPrompt) return _cachedFullPrompt;
  const [base, toolsCtx] = await Promise.all([
    getSystemPromptWithoutTools(),
    loadPrompt("tools"),
  ]);
  _cachedFullPrompt = `${base}\n\n---\n\n${toolsCtx}`;
  return _cachedFullPrompt;
}

/**
 * Retrieves the base prompt for the first pass (tool extraction).
 * @returns {Promise<string>} The pass 1 base prompt.
 */
async function getPass1BasePrompt() {
  if (_cachedPass1Base) return _cachedPass1Base;
  const toolsCtx = await loadPrompt("tools");
  _cachedPass1Base = `You are Shantha, a Discord bot. Your ONLY task right now: read the user's message and output the correct JSON tool_call, or answer directly if no tool is needed. When calling a tool, output ONLY the JSON — no extra text.\n\n${toolsCtx}`;
  return _cachedPass1Base;
}

/**
 * Retrieves the base prompt for the second pass (natural language synthesis).
 * @returns {Promise<string>} The pass 2 base prompt.
 */
async function getPass2BasePrompt() {
  if (_cachedPass2Base) return _cachedPass2Base;
  const master = await loadPrompt("personality");

  _cachedPass2Base = `${master}\n\nKeep your response short (1–3 sentences), casual, and conversational. Do NOT output raw JSON, IDs, or object dumps. CRITICAL: You are in synthesis mode — you MUST NOT emit any tool calls, function calls, XML tags like <tool_call> or <tool_calls_section_begin>, or JSON tool-call objects. Only write a plain conversational reply. IMPORTANT: If the tool result contains "success": false or an "error" field, the action FAILED — tell the user you couldn't get that information or the action didn't work. Do NOT say you'll check or that you'll look it up — just report the failure naturally.`;
  return _cachedPass2Base;
}

let agentInitialized = false;

/**
 * Initializes the agent, tools, and prompts.
 * @param {object} client - The Discord client instance.
 * @returns {Promise<object>} The initialized agent methods.
 */
export async function initializeAgent(client) {
  if (agentInitialized) {
    console.log("[AGENT] Already initialized, skipping");
    return { processMessage, executeCommand, getStats };
  }

  await initializeTools(client);
  initEmojis(client);

  await Promise.all([
    getSystemPrompt(),
    getPass1BasePrompt(),
    getPass2BasePrompt(),
  ]);
  _model = getLanguageModel();

  agentInitialized = true;
  console.log("[AGENT] Initialized successfully");
  return { processMessage, executeCommand, getStats };
}

/**
 * Executes a tool by its name with the provided parameters.
 * @param {string} toolName - The name of the tool to execute.
 * @param {object} params - The parameters for the tool.
 * @returns {Promise<object>} The result of the tool execution.
 */
async function executeToolByName(toolName, params) {
  try {
    let toolsConfig = {};
    try {
      const configPath = path.join(__dirname, "tools.json");
      const fileContent = await fs.readFile(configPath, "utf-8");
      toolsConfig = JSON.parse(fileContent);
    } catch {}

    if (toolsConfig[toolName] === false) {
      return {
        success: false,
        error: `Tool ${toolName} is currently disabled by configuration.`,
      };
    }
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

/**
 * Processes a user message, potentially executing tools and generating a response.
 * @param {string} userId - The ID of the user sending the message.
 * @param {string} guildId - The ID of the guild where the message was sent.
 * @param {string} message - The content of the user's message.
 * @param {string} [username="Unknown"] - The username of the user.
 * @returns {Promise<object>} The result of processing the message, including the response.
 */
export async function processMessage(
  userId,
  guildId,
  message,
  username = "Unknown",
) {
  console.log(`[AGENT] Processing message from user ${userId} (${username})`);

  try {
    const model = _model ?? getLanguageModel();
    const pass1Base = await getPass1BasePrompt();
    const nowUtc = new Date().toLocaleString("en-US", {
      timeZone: "UTC",
      dateStyle: "full",
      timeStyle: "short",
    });
    const pass1System = `${pass1Base}\n\n- userId: \`${userId}\`\n- username: \`${username}\`\n- guildId: \`${guildId}\`\n- Use these exact IDs when a tool requires them.\n- Current date/time: ${nowUtc} UTC (use this year for any search queries, not your training cutoff year).`;

    const recentMessages = contextManager.getFormattedHistory(
      userId,
      guildId,
      2,
    );
    const isFollowUp =
      message.length < 60 ||
      RE_FOLLOW_UP_PRONOUNS.test(message) ||
      RE_FOLLOW_UP_WORDS.test(message);

    let historyMessages = recentMessages;
    if (isFollowUp && contextManager.getHistory(userId, guildId).length > 15) {
      try {
        const searchResult = await contextManager.searchHistory(
          userId,
          guildId,
          message,
          7,
        );
        if (searchResult?.success && searchResult.results?.length > 0) {
          const recentContents = new Set(recentMessages.map((m) => m.content));
          const semanticMessages = searchResult.results
            .map((r) => ({ role: r.message.role, content: r.message.content }))
            .filter((m) => !recentContents.has(m.content));
          historyMessages = [...semanticMessages, ...recentMessages];
          console.log(
            `[AGENT] Smart context: ${semanticMessages.length} semantic + ${recentMessages.length} recent messages`,
          );
        }
      } catch (ctxErr) {
        console.warn(
          "[AGENT] Smart context retrieval failed, using recent only:",
          ctxErr.message,
        );
      }
    }

    const pass1Messages = [
      ...historyMessages,
      { role: "user", content: message },
    ];

    const pass1 = await generateText({
      model,
      system: pass1System,
      messages: pass1Messages,
      maxTokens: 300,
      maxSteps: 1,
    });

    const rawOutput = (pass1.text || "").trim();
    console.log(
      `[AGENT] Pass 1 output (${pass1.finishReason}): ${rawOutput.substring(0, 150)}`,
    );

    const toolCall = extractToolCall(rawOutput);

    if (!toolCall) {
      console.log("[AGENT] No tool call — using direct response");
      const looksLikeToolCall = RE_LOOKS_LIKE_TOOL.test(rawOutput);
      let safeResponse;
      if (looksLikeToolCall) {
        safeResponse =
          "I'm not sure how to help with that right now. Could you rephrase?";
        console.log("[AGENT] Suppressed raw JSON tool-call from Pass 1 output");
      } else {
        const xmlCutIdx = rawOutput.search(RE_XML_TOOL_BLEED);
        if (xmlCutIdx !== -1) {
          safeResponse = rawOutput.substring(0, xmlCutIdx).trim();
          console.log(
            "[AGENT] Stripped XML tool-call bleed from Pass 1 direct response",
          );
          if (!safeResponse)
            safeResponse =
              "I looked into it but couldn't get the information right now. Please try again!";
        } else {
          safeResponse = rawOutput;
        }
      }
      await Promise.all([
        contextManager.addMessage(userId, guildId, "user", message),
        contextManager.addMessage(userId, guildId, "assistant", safeResponse),
      ]);
      return { success: true, response: safeResponse, components: [] };
    }

    const { name: toolName, params: toolParams = {} } = toolCall;
    console.log(
      `[AGENT] Tool call: ${toolName}`,
      JSON.stringify(toolParams).substring(0, 120),
    );

    const enrichedParams = { ...toolParams, userId, guildId, username };

    let toolResult = await executeToolByName(toolName, enrichedParams);
    if (toolName === "serverInfo" && toolParams.infoType === "members") {
      const personMatch = message.match(RE_PERSON_MATCH);
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

    // If fetchWebPage failed, fall back to webSearch automatically
    if (toolName === "fetchWebPage" && toolResult?.success === false) {
      const urlParam = toolParams?.url || "";
      const wttrMatch = urlParam.match(RE_WTTR_MATCH);
      const isTimeQuery = RE_TIME_QUERY.test(message);
      let fallbackQuery;
      if (wttrMatch && isTimeQuery) {
        const location = decodeURIComponent(wttrMatch[1].replace(/,/g, " "));
        fallbackQuery = `current time in ${location}`;
        console.log(
          `[AGENT] fetchWebPage wttr.in time-query — searching for time: "${fallbackQuery}"`,
        );
      } else if (wttrMatch) {
        fallbackQuery = `${decodeURIComponent(wttrMatch[1].replace(/,/g, " "))} weather`;
        console.log(
          `[AGENT] fetchWebPage failed — falling back to webSearch: "${fallbackQuery}"`,
        );
      } else {
        fallbackQuery = message;
        console.log(
          `[AGENT] fetchWebPage failed — falling back to webSearch with original message`,
        );
      }
      const wsResult = await executeToolByName("webSearch", {
        query: fallbackQuery,
        userId,
        guildId,
        username,
      });
      if (wsResult?.success) {
        finalToolName = "webSearch";
        finalToolResult = wsResult;
        console.log("[AGENT] fetchWebPage→webSearch fallback succeeded");
      }
    }

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
        username,
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
        console.log(
          "[AGENT] ragQuery empty — no further fallback (pass to Pass 2 as unknown member)",
        );
      }
    }

    if (finalToolName === "createEmbed") {
      const components = finalToolResult?.components || [];
      const errMsg =
        finalToolResult?.success === false
          ? finalToolResult.error || "Couldn't create the embed."
          : "";
      await Promise.all([
        contextManager.addMessage(userId, guildId, "user", message),
        contextManager.addMessage(
          userId,
          guildId,
          "assistant",
          errMsg || "[embed]",
        ),
      ]);
      return { success: true, response: errMsg, components };
    }

    if (ACTION_ONLY_TOOLS.has(finalToolName)) {
      const finalResp =
        finalToolResult?.success === false
          ? finalToolResult.error || "Sorry, that didn't work."
          : finalToolResult?.message || `${icon("SUCCESS")} Done!`;
      await Promise.all([
        contextManager.addMessage(userId, guildId, "user", message),
        contextManager.addMessage(userId, guildId, "assistant", finalResp),
      ]);
      return { success: true, response: finalResp, components: [] };
    }

    if (
      finalToolName === "musicControl" &&
      !MUSIC_INFO_ACTIONS.has(toolParams.action)
    ) {
      const finalResp =
        finalToolResult?.success === false
          ? finalToolResult.error || "Sorry, that didn't work."
          : getMusicConfirmation(toolParams.action) ||
            `${icon("SUCCESS")} Done!`;
      await Promise.all([
        contextManager.addMessage(userId, guildId, "user", message),
        contextManager.addMessage(userId, guildId, "assistant", finalResp),
      ]);
      return { success: true, response: finalResp, components: [] };
    }

    // Pass 2: feed tool result back for natural language synthesis
    const pass2Base = await getPass2BasePrompt();
    const toolResultStr = JSON.stringify(finalToolResult, null, 2);
    const toolContext = `[${finalToolName} result]:\n${
      toolResultStr.length > 3000
        ? toolResultStr.slice(0, 3000) + "\n...(truncated)"
        : toolResultStr
    }`;
    const userContext = `You are talking to user: ${username}`;

    const runPass2 = async (ctx) => {
      try {
        return await generateText({
          model,
          system: `${pass2Base}\n\n${userContext}\n\n${ctx}`,
          messages: [...historyMessages, { role: "user", content: message }],
          maxTokens: 400,
          maxSteps: 1,
        });
      } catch (err) {
        const failedGen = err?.data?.error?.failed_generation;
        if (!failedGen) throw err;
        try {
          const toolAttempt =
            typeof failedGen === "string" ? JSON.parse(failedGen) : failedGen;
          const extraToolName = toolAttempt?.name;
          const rawArgs = toolAttempt?.arguments;
          const extraParams =
            typeof rawArgs === "string" ? JSON.parse(rawArgs) : (rawArgs ?? {});
          if (extraToolName) {
            console.log(
              `[AGENT] Pass 2 tool attempt (${extraToolName}) intercepted — executing and retrying`,
            );
            const extraResult = await executeToolByName(extraToolName, {
              ...extraParams,
              userId,
              guildId,
              username,
            }).catch(() => null);
            if (extraResult) {
              const extraCtx = `${ctx}\n\n[${extraToolName} additional result]:\n${JSON.stringify(extraResult, null, 2).slice(0, 1500)}`;
              return await generateText({
                model,
                system: `${pass2Base}\n\n${extraCtx}`,
                messages: [
                  ...historyMessages,
                  { role: "user", content: message },
                ],
                maxTokens: 400,
                maxSteps: 1,
              });
            }
          }
        } catch (retryErr) {
          console.error(
            "[AGENT] Pass 2 retry after tool intercept failed:",
            retryErr.message,
          );
        }
        throw err;
      }
    };

    let pass2;
    try {
      pass2 = await runPass2(toolContext);
    } catch (pass2Err) {
      console.error("[AGENT] Pass 2 failed:", pass2Err.message);
    }

    let finalResponse = (pass2?.text || "").trim();
    // Strip any tool_call (XML or JSON) that the model may have emitted in Pass 2
    const xmlIdx = finalResponse.search(RE_XML_CUT);
    const funcIdx = finalResponse.indexOf("<function=");
    const jsonIdx = finalResponse.search(RE_JSON_CUT);
    const pyFuncIdx = finalResponse.search(RE_PY_FUNC_CUT);
    const allCuts = [xmlIdx, funcIdx, jsonIdx, pyFuncIdx].filter(
      (i) => i !== -1,
    );
    const cutIdx = allCuts.length > 0 ? Math.min(...allCuts) : -1;
    if (cutIdx !== -1) {
      finalResponse = finalResponse.substring(0, cutIdx).trim();
      if (!finalResponse) {
        if (finalToolResult?.success !== false) {
          const results = finalToolResult?.results;
          if (
            finalToolName === "serverInfo" &&
            Array.isArray(results) &&
            results.length > 0
          ) {
            const user = results[0];
            if (/mention/i.test(message) && user.id) {
              finalResponse = `<@${user.id}>`;
            } else {
              finalResponse = `Here's what I found: **${user.displayName || user.username}** (${user.status || "unknown"})`;
            }
          } else {
            finalResponse =
              "I looked into it but couldn't get the information right now. Please try again!";
          }
        } else {
          finalResponse =
            "I looked into it but couldn't get the information right now. Please try again!";
        }
      }
    }
    console.log(
      `[AGENT] Pass 2 synthesized: ${finalResponse.substring(0, 120)}`,
    );

    await Promise.all([
      contextManager.addMessage(userId, guildId, "user", message),
      contextManager.addMessage(userId, guildId, "assistant", finalResponse),
    ]);
    return { success: true, response: finalResponse, components: [] };
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
 * Executes a command using the executeCommand tool.
 * @param {string} command - The command to execute.
 * @param {object} params - The parameters for the command.
 * @param {string} userId - The ID of the user executing the command.
 * @param {string} guildId - The ID of the guild where the command is executed.
 * @returns {Promise<object>} The result of the command execution.
 */
export async function executeCommand(command, params, userId, guildId) {
  return await tools.executeCommand.execute({
    command,
    parameters: params,
    userId,
    guildId,
  });
}

/**
 * Retrieves statistics for the agent's components.
 * @returns {object} The statistics object.
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
 * Initializes the entire agent system.
 * @param {object} discordClient - The Discord client instance.
 * @returns {Promise<object>} The initialized agent.
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
