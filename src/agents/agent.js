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
import { createLogger } from "../utils/logger.js";

const log = createLogger("agent");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const promptCache = new Map();

let _cachedBasePrompt = null;
let _cachedFullPrompt = null;
let _cachedPass1Base = null;
let _cachedPass2Base = null;
let _model = null;

function llmCallOptions() {
  return {
    temperature: config.model.temperature,
    maxOutputTokens: config.model.maxTokens,
    abortSignal: AbortSignal.timeout(config.model.requestTimeoutMs),
  };
}

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

async function filterToolsContext(content) {
  const toolsConfig = config.agentTools || {};

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

async function getSystemPromptWithoutTools() {
  if (_cachedBasePrompt) return _cachedBasePrompt;
  const [personality, master] = await Promise.all([
    loadPrompt("personality"),
    loadPrompt("master"),
  ]);

  _cachedBasePrompt = `${personality}\n\n---\n\n${master}`;
  return _cachedBasePrompt;
}

async function getSystemPrompt() {
  if (_cachedFullPrompt) return _cachedFullPrompt;
  const [base, toolsCtx] = await Promise.all([
    getSystemPromptWithoutTools(),
    loadPrompt("tools"),
  ]);
  _cachedFullPrompt = `${base}\n\n---\n\n${toolsCtx}`;
  return _cachedFullPrompt;
}

async function getPass1BasePrompt() {
  if (_cachedPass1Base) return _cachedPass1Base;
  const toolsCtx = await loadPrompt("tools");
  _cachedPass1Base = `You are Shantha, a Discord bot. Your ONLY task right now: read the user's message and output the correct JSON tool_call, or answer directly if no tool is needed. When calling a tool, output ONLY the JSON — no extra text.\n\n${toolsCtx}`;
  return _cachedPass1Base;
}

async function getPass2BasePrompt() {
  if (_cachedPass2Base) return _cachedPass2Base;
  const master = await loadPrompt("personality");

  _cachedPass2Base = `${master}\n\nKeep your response short (1–3 sentences), casual, and conversational. Do NOT output raw JSON, IDs, or object dumps. CRITICAL: You are in synthesis mode — you MUST NOT emit any tool calls, function calls, XML tags like <tool_call> or <tool_calls_section_begin>, or JSON tool-call objects. Only write a plain conversational reply. IMPORTANT: If the tool result contains "success": false or an "error" field, the action FAILED — tell the user you couldn't get that information or the action didn't work. Do NOT say you'll check or that you'll look it up — just report the failure naturally.`;
  return _cachedPass2Base;
}

let agentInitialized = false;

export async function initializeAgent(client) {
  if (agentInitialized) {
    log.info("Already initialized, skipping");
    return { processMessage, executeCommand, getStats };
  }

  await initializeTools(client);
  await initEmojis(client);

  await Promise.all([
    getSystemPrompt(),
    getPass1BasePrompt(),
    getPass2BasePrompt(),
  ]);
  _model = getLanguageModel();

  agentInitialized = true;
  log.info("Initialized successfully");
  return { processMessage, executeCommand, getStats };
}

async function executeToolByName(toolName, params) {
  try {
    if (config.agentTools?.[toolName] === false) {
      return {
        success: false,
        error: `Tool ${toolName} is currently disabled by configuration.`,
      };
    }
    const toolObj = tools[toolName];
    if (!toolObj?.execute) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    let validatedParams = params;
    if (toolObj.parameters) {
      try {
        validatedParams = toolObj.parameters.parse(params);
      } catch (zodError) {
        log.warn(`Zod validation failed for ${toolName}:`, zodError.message);
        return {
          success: false,
          error: `Invalid parameters: ${zodError.message}`,
        };
      }
    }

    const result = await toolObj.execute(validatedParams);
    return result ?? { success: true };
  } catch (err) {
    log.error(`Tool execution error (${toolName}):`, err);
    return { success: false, error: err.message };
  }
}

export async function processMessage(
  userId,
  guildId,
  message,
  username = "Unknown",
) {
  log.info(`Processing message from user ${userId} (${username})`);

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
          log.info(
            `Smart context: ${semanticMessages.length} semantic + ${recentMessages.length} recent messages`,
          );
        }
      } catch (ctxErr) {
        log.warn(
          "Smart context retrieval failed, using recent only:",
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
      ...llmCallOptions(),
    });

    const rawOutput = (pass1.text || "").trim();
    log.info(
      `Pass 1 output (${pass1.finishReason}): ${rawOutput.substring(0, 150)}`,
    );

    const toolCall = extractToolCall(rawOutput);

    if (!toolCall) {
      log.info("No tool call — using direct response");
      const looksLikeToolCall = RE_LOOKS_LIKE_TOOL.test(rawOutput);
      let safeResponse;
      if (looksLikeToolCall) {
        safeResponse =
          "I'm not sure how to help with that right now. Could you rephrase?";
        log.info("Suppressed raw JSON tool-call from Pass 1 output");
      } else {
        const xmlCutIdx = rawOutput.search(RE_XML_TOOL_BLEED);
        if (xmlCutIdx !== -1) {
          safeResponse = rawOutput.substring(0, xmlCutIdx).trim();
          log.info("Stripped XML tool-call bleed from Pass 1 direct response");
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
    log.info(
      `Tool call: ${toolName}`,
      JSON.stringify(toolParams).substring(0, 120),
    );

    const enrichedParams = { ...toolParams, userId, guildId, username };

    if (toolName === "generateImage") {
      const rawPrompt = message.replace(/\[Attached images:.*?\]/g, "").trim();
      enrichedParams.prompt = rawPrompt;
    }

    let toolResult = await executeToolByName(toolName, enrichedParams);
    if (toolName === "serverInfo" && toolParams.infoType === "members") {
      const personMatch = message.match(RE_PERSON_MATCH);
      if (personMatch) {
        const searchTerm = personMatch[1].trim();
        log.info(`Redirecting infoType=members → search for: "${searchTerm}"`);
        const searchResult = await executeToolByName("serverInfo", {
          ...enrichedParams,
          infoType: "search",
          searchQuery: searchTerm,
        });
        if (searchResult?.success && searchResult.results?.length > 0) {
          toolResult = searchResult;
          enrichedParams.infoType = "search";
          enrichedParams.searchQuery = searchTerm;
          log.info(
            `Redirected search result: ${JSON.stringify(searchResult).substring(0, 100)}`,
          );
        }
      }
    }

    log.info(
      `Tool result (${toolName}):`,
      JSON.stringify(toolResult).substring(0, 150),
    );

    let finalToolName = toolName;
    let finalToolResult = toolResult;

    if (toolName === "fetchWebPage" && toolResult?.success === false) {
      const urlParam = toolParams?.url || "";
      const wttrMatch = urlParam.match(RE_WTTR_MATCH);
      const isTimeQuery = RE_TIME_QUERY.test(message);
      let fallbackQuery;
      if (wttrMatch && isTimeQuery) {
        const location = decodeURIComponent(wttrMatch[1].replace(/,/g, " "));
        fallbackQuery = `current time in ${location}`;
        log.info(
          `fetchWebPage wttr.in time-query — searching for time: "${fallbackQuery}"`,
        );
      } else if (wttrMatch) {
        fallbackQuery = `${decodeURIComponent(wttrMatch[1].replace(/,/g, " "))} weather`;
        log.info(
          `fetchWebPage failed — falling back to webSearch: "${fallbackQuery}"`,
        );
      } else {
        fallbackQuery = message;
        log.info(
          `fetchWebPage failed — falling back to webSearch with original message`,
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
        log.info("fetchWebPage→webSearch fallback succeeded");
      }
    }

    if (
      toolName === "serverInfo" &&
      enrichedParams.infoType === "search" &&
      toolResult?.success &&
      (toolResult.count === 0 || toolResult.results?.length === 0)
    ) {
      log.info("serverInfo returned no results — trying ragQuery");
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
        log.info("Identity fallback: using ragQuery result");
      } else {
        log.info(
          "ragQuery empty — no further fallback (pass to Pass 2 as unknown member)",
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
      return {
        success: true,
        response: finalResp,
        components: [],
        files: finalToolResult?.files,
      };
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
          ...llmCallOptions(),
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
            log.info(
              `Pass 2 tool attempt (${extraToolName}) intercepted — executing and retrying`,
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
                ...llmCallOptions(),
              });
            }
          }
        } catch (retryErr) {
          log.error(
            "Pass 2 retry after tool intercept failed:",
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
      log.error("Pass 2 failed:", pass2Err.message);
    }

    let finalResponse = (pass2?.text || "").trim();
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
    }

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
    log.info(`Pass 2 synthesized: ${finalResponse.substring(0, 120)}`);

    await Promise.all([
      contextManager.addMessage(userId, guildId, "user", message),
      contextManager.addMessage(userId, guildId, "assistant", finalResponse),
    ]);
    return { success: true, response: finalResponse, components: [] };
  } catch (error) {
    log.error("Error:", error);
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
  log.info("Initializing...");

  const agent = await initializeAgent(discordClient);

  log.info(`Model: ${config.model.provider} - ${config.model.name}`);
  log.info(`RAG: ${config.rag.enabled ? "Enabled" : "Disabled"}`);
  log.info(
    `Commands: ${config.commandExecution.enabled ? "Enabled" : "Disabled"}`,
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
