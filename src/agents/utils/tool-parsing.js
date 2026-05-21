/**
 * @file tool-parsing.js
 * @description Tool call parsing utilities for extracting tool invocations from LLM responses. Handles JSON, XML, and various malformed formats.
 */

// Pre-compiled regexes for tool extraction (avoids re-creating on each call)
export const RE_JSON_TOOL_CALL = /\{\s*"tool_call"/;
export const RE_XML_FUNCTION = /<function=(\w+)>/;
export const RE_XML_PARAM = /<parameter=(\w+)>\s*([\s\S]*?)\s*<\/parameter>/g;

// Follow-up detection patterns
export const RE_FOLLOW_UP_PRONOUNS =
  /\b(he|she|they|him|her|them|that|this|it|those|these|who|same|their|his|her|my|your|our|we|i)\b/i;
export const RE_FOLLOW_UP_WORDS =
  /\b(now|again|still|so|also|too|else|another|more|why|how|what about|and|but)\b/i;

// Tool bleed detection (when model emits tool calls in text response)
export const RE_LOOKS_LIKE_TOOL = /^\s*\{[\s\S]*"(?:tool_call|tool|name)"\s*:/;
export const RE_XML_TOOL_BLEED = /<\|?tool_calls?/i;
export const RE_XML_CUT = /<\|?tool_calls?/i;
export const RE_JSON_CUT = /^\s*\{\s*"(?:tool_call|tool_calls)"\s*:/m;
export const RE_PY_FUNC_CUT =
  /^\s*(?:createEmbed|executeCommand|discordAction|serverInfo|fetchWebPage|webSearch)\s*\(/m;

// Message content patterns
export const RE_PERSON_MATCH =
  /(?:who\s+is|do\s+you\s+know|find|tell\s+me\s+about|what(?:'s|\s+is)(?:\s+up\s+with)?)\s+([\w.\-]+)/i;
export const RE_WTTR_MATCH = /wttr\.in\/([^?]+)/i;
export const RE_TIME_QUERY = /\b(time|what time|current time|clock)\b/i;

/**
 * Extracts a tool call from LLM response text.
 * Handles multiple formats: JSON, XML (<function=NAME>), wrapped <tool_calls>, etc.
 * @param {string} text - Raw LLM response.
 * @returns {{ name: string, params: object } | null} The extracted tool call, or null if none found.
 */
export function extractToolCall(text) {
  const stripped = text.replace(/```(?:json)?\s*\n?/gi, "").trim();

  // Fast path: try direct JSON parse first
  try {
    const parsed = JSON.parse(stripped);
    if (parsed.tool_call?.name) return parsed.tool_call;
  } catch {}

  // Look for {"tool_call" pattern
  const idx = stripped.search(RE_JSON_TOOL_CALL);
  if (idx !== -1) {
    // Brace-matching to extract JSON object
    let depth = 0,
      end = -1;
    for (let i = idx; i < stripped.length; i++) {
      if (stripped[i] === "{") depth++;
      else if (stripped[i] === "}") {
        if (--depth === 0) {
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
    } else {
      // Try adding missing closing braces
      for (let extra = 1; extra <= 3; extra++) {
        try {
          const parsed = JSON.parse(stripped.slice(idx) + "}".repeat(extra));
          if (parsed.tool_call?.name) return parsed.tool_call;
        } catch {}
      }
    }
  }

  // XML format from stepfun: <function=NAME><parameter=KEY>VAL</parameter>
  if (text.includes("<tool_call>") || text.includes("<function=")) {
    const funcMatch = text.match(RE_XML_FUNCTION);
    if (funcMatch) {
      const toolName = funcMatch[1];
      const params = {};
      // Reset lastIndex for global regex
      RE_XML_PARAM.lastIndex = 0;
      let m;
      while ((m = RE_XML_PARAM.exec(text)) !== null) {
        const key = m[1],
          val = m[2].trim();
        const numVal = Number(val);
        params[key] =
          val !== "" && /^\d+$/.test(val) && Number.isSafeInteger(numVal)
            ? numVal
            : val;
      }
      return { name: toolName, params };
    }
  }

  // Handle <tool_calls> wrapper
  const toolCallsStart = text.indexOf("<tool_calls>");
  if (toolCallsStart !== -1) {
    const inner = text.slice(toolCallsStart + 12); // "<tool_calls>".length = 12
    if (inner.includes("<tool_call>") || inner.includes("<function=")) {
      const nested = extractToolCall(inner);
      if (nested) return nested;
    }
    try {
      const closingIdx = inner.indexOf("</tool_calls>");
      const jsonStr = (
        closingIdx !== -1 ? inner.slice(0, closingIdx) : inner
      ).trim();
      const parsed = JSON.parse(jsonStr);
      const entry = Array.isArray(parsed) ? parsed[0] : parsed;
      if (entry?.function?.name) {
        const fn = entry.function;
        const params =
          typeof fn.arguments === "string"
            ? JSON.parse(fn.arguments)
            : (fn.arguments ?? {});
        return { name: fn.name, params };
      }
      if (
        entry?.name &&
        (entry.parameters ?? entry.params ?? entry.arguments)
      ) {
        const p =
          entry.parameters ??
          entry.params ??
          (typeof entry.arguments === "string"
            ? JSON.parse(entry.arguments)
            : entry.arguments) ??
          {};
        return { name: entry.name, params: p };
      }
    } catch {}
  }

  return null;
}
