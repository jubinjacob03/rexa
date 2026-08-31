import { tool } from "ai";
import { z } from "zod";
import { BoundedMap } from "../../utils/resilience.js";

const HTTP_CONFIG = {
  timeout: 10000,
  maxResponseSize: 5242880,
  maxRetries: 3,
  retryDelay: 1000,
  allowAllDomains: true,
  blockedDomains: process.env.HTTP_TOOL_BLOCKED_DOMAINS?.split(",") || [],
  rateLimit: 60,
};

const rateLimitTracker = new BoundedMap({
  maxSize: 500,
  ttlMs: 5 * 60 * 1000,
});

let _discordClient = null;

export function initializeExecutor(client) {
  _discordClient = client;
}

const WORKFLOWS = {
  "welcome-new-member": {
    description: "Welcome a new member with verification prompt",
    steps: [
      {
        type: "send-message",
        channel: "welcome",
        message: "Welcome to the server!",
      },
      { type: "assign-role", role: "unverified" },
      { type: "log", message: "New member welcomed" },
    ],
  },

  "setup-private-vc": {
    description: "Create and configure a private voice channel",
    steps: [
      { type: "create-channel", name: "Private VC", type: "voice" },
      {
        type: "set-permissions",
        target: "owner",
        permissions: ["manage", "invite"],
      },
      { type: "send-message", message: "Private VC created!" },
    ],
  },

  "play-music": {
    description: "Play music in voice channel",
    steps: [
      { type: "join-voice", channel: "user-voice" },
      { type: "execute-command", command: "play", params: ["query"] },
      { type: "send-message", message: "Now playing!" },
    ],
  },

  "server-stats": {
    description: "Gather and display server statistics",
    steps: [
      { type: "fetch-stats", stats: ["members", "channels", "roles"] },
      { type: "create-embed", title: "Server Stats" },
      { type: "send-message", embed: true },
    ],
  },

  "fetch-web-data": {
    description: "Fetch and process data from a website",
    steps: [
      { type: "http-request", method: "GET" },
      { type: "parse-response", format: "json" },
      { type: "return-data" },
    ],
  },
};

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  if (host.includes(":")) {
    return (
      host === "::1" ||
      host === "::" ||
      host.startsWith("fe80:") ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("::ffff:")
    );
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  return false;
}

function isAllowedDomain(url) {
  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    return false;
  }

  if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
    return false;
  }

  const hostname = urlObj.hostname.toLowerCase();

  if (isPrivateHost(hostname)) {
    return process.env.NODE_ENV === "development";
  }

  if (HTTP_CONFIG.blockedDomains.length > 0) {
    const isBlocked = HTTP_CONFIG.blockedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
    if (isBlocked) return false;
  }

  return HTTP_CONFIG.allowAllDomains;
}

function checkRateLimit(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const now = Date.now();
    const minute = 60000;

    const requests = rateLimitTracker.get(domain) || [];
    const recentRequests = requests.filter((time) => now - time < minute);

    if (recentRequests.length >= HTTP_CONFIG.rateLimit) {
      rateLimitTracker.set(domain, recentRequests);
      return {
        allowed: false,
        resetIn: minute - (now - recentRequests[0]),
      };
    }

    recentRequests.push(now);
    rateLimitTracker.set(domain, recentRequests);
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "manual",
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

async function safeFetch(url, options, timeout, maxRedirects = 5) {
  let currentUrl = url;
  for (let hop = 0; ; hop += 1) {
    if (!isAllowedDomain(currentUrl)) {
      throw new Error(
        `Domain blocked or not allowed: ${new URL(currentUrl).hostname}`,
      );
    }
    const response = await fetchWithTimeout(currentUrl, options, timeout);
    if (!REDIRECT_STATUS.has(response.status)) return response;
    if (hop >= maxRedirects) {
      throw new Error("Too many redirects");
    }
    const location = response.headers.get("location");
    if (!location) return response;
    currentUrl = new URL(location, currentUrl).toString();
  }
}

export async function executeHttpRequest(options, retryCount = 0) {
  const {
    url,
    method = "GET",
    headers = {},
    body = null,
    auth = null,
    timeout = HTTP_CONFIG.timeout,
    parseAs = "json",
    maxRetries = HTTP_CONFIG.maxRetries,
  } = options;

  if (!isAllowedDomain(url)) {
    const hostname = new URL(url).hostname;
    throw new Error(`Domain blocked or not allowed: ${hostname}`);
  }

  const rateCheck = checkRateLimit(url);
  if (!rateCheck.allowed) {
    throw new Error(
      `Rate limit exceeded. Try again in ${Math.ceil(rateCheck.resetIn / 1000)}s`,
    );
  }

  const requestHeaders = { ...headers };

  if (auth) {
    switch (auth.type) {
      case "bearer":
        requestHeaders["Authorization"] = `Bearer ${auth.token}`;
        break;
      case "apiKey":
        requestHeaders["X-API-Key"] = auth.token;
        break;
      case "basic":
        const credentials = btoa(`${auth.username}:${auth.password}`);
        requestHeaders["Authorization"] = `Basic ${credentials}`;
        break;
    }
  }

  if (["POST", "PUT", "PATCH"].includes(method.toUpperCase()) && body) {
    if (!requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }
  }

  const requestOptions = {
    method: method.toUpperCase(),
    headers: requestHeaders,
  };

  if (body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
    requestOptions.body =
      typeof body === "string" ? body : JSON.stringify(body);
  }

  try {
    console.log(
      `[EXECUTOR] ${method.toUpperCase()} ${url} (attempt ${retryCount + 1})`,
    );

    const response = await safeFetch(url, requestOptions, timeout);

    const contentLength = response.headers.get("content-length");
    if (
      contentLength &&
      parseInt(contentLength) > HTTP_CONFIG.maxResponseSize
    ) {
      throw new Error(`Response too large: ${contentLength} bytes`);
    }

    let data;
    const contentType = response.headers.get("content-type") || "";

    if (parseAs === "json" || contentType.includes("application/json")) {
      data = await response.json();
    } else if (parseAs === "text") {
      data = await response.text();
    } else {
      data = await response.text();
    }

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data,
      url: response.url,
    };
  } catch (error) {
    console.error(`[EXECUTOR] HTTP error: ${error.message}`);

    if (retryCount < maxRetries) {
      const isRetryable =
        error.message.includes("timeout") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT");

      if (isRetryable) {
        const delay = HTTP_CONFIG.retryDelay * Math.pow(2, retryCount);
        console.log(`[EXECUTOR] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return executeHttpRequest(options, retryCount + 1);
      }
    }

    return {
      success: false,
      error: error.message,
      retries: retryCount,
    };
  }
}

export async function fetchWebPage(url) {
  try {
    const result = await executeHttpRequest({
      url,
      method: "GET",
      parseAs: "text",
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    let content = result.data;
    let title = "Untitled";

    if (typeof content === "object") {
      content = JSON.stringify(content, null, 2);
      title = "JSON Response";
    } else if (typeof content !== "string") {
      content = String(content);
    }

    if (content.includes("<html") || content.includes("</html>")) {
      let text = content.replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        "",
      );
      text = text.replace(
        /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
        "",
      );
      text = text.replace(/<[^>]+>/g, " ");
      text = text.replace(/\s+/g, " ").trim();

      const maxLength = 5000;
      if (text.length > maxLength) {
        text = text.substring(0, maxLength) + "...";
      }

      return {
        success: true,
        url,
        title: content.match(/<title>(.*?)<\/title>/i)?.[1] || "Untitled",
        content: text,
        length: text.length,
      };
    }

    const maxLength = 5000;
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + "...";
    }

    return {
      success: true,
      url,
      title,
      content,
      length: content.length,
    };
  } catch (error) {
    console.error(`[EXECUTOR] Web fetch error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function webSearch(query, options = {}) {
  const { maxResults = 5 } = options;
  const tavilyKey = process.env.TAVILY_API_KEY;

  if (tavilyKey) {
    try {
      const result = await executeHttpRequest({
        url: "https://api.tavily.com/search",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tavilyKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          search_depth: "advanced",
          include_answer: true,
        }),
        parseAs: "json",
        timeout: 15000,
        maxRetries: 0,
      });

      if (result.success && result.data?.results?.length) {
        const results = result.data.results.slice(0, maxResults);
        return {
          success: true,
          query,
          answer: result.data.answer || results[0]?.content || null,
          source: results[0]?.title || null,
          url: results[0]?.url || null,
          relatedTopics: results.map((r) => ({
            text: r.title + (r.content ? ` — ${r.content.slice(0, 120)}` : ""),
            url: r.url,
          })),
        };
      }
      console.log(
        "[EXECUTOR] Tavily Search returned no results, falling back to DuckDuckGo",
      );
    } catch (error) {
      console.error(
        `[EXECUTOR] Tavily Search error: ${error.message}, falling back to DuckDuckGo`,
      );
    }
  }

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

    const result = await executeHttpRequest({
      url,
      method: "GET",
      parseAs: "json",
      timeout: 30000,
      maxRetries: 0,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const data = result.data;

    return {
      success: true,
      query,
      answer: data.AbstractText || null,
      source: data.AbstractSource || null,
      url: data.AbstractURL || null,
      relatedTopics: (data.RelatedTopics || [])
        .slice(0, maxResults)
        .map((topic) => ({
          text: topic.Text,
          url: topic.FirstURL,
        })),
    };
  } catch (error) {
    console.error(`[EXECUTOR] Web search error:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function executeWorkflow(workflowName, context = {}) {
  const workflow = WORKFLOWS[workflowName];

  if (!workflow) {
    return {
      success: false,
      error: `Workflow not found: ${workflowName}`,
      available: Object.keys(WORKFLOWS),
    };
  }

  console.log(`[EXECUTOR] Executing workflow: ${workflowName}`);

  const results = [];

  try {
    for (const step of workflow.steps) {
      console.log(`[EXECUTOR] Step: ${step.type}`);

      let stepResult = { type: step.type, success: true };

      switch (step.type) {
        case "send-message":
          stepResult.message = "Message would be sent";
          break;

        case "http-request":
          if (context.url) {
            stepResult = await executeHttpRequest({
              url: context.url,
              method: step.method || "GET",
            });
          }
          break;

        case "execute-command":
          stepResult.message = `Would execute command: ${step.command}`;
          break;

        case "log":
          console.log(`[WORKFLOW] ${step.message}`);
          break;

        default:
          stepResult.message = `Step ${step.type} executed`;
      }

      results.push(stepResult);
    }

    return {
      success: true,
      workflow: workflowName,
      steps: results.length,
      results,
    };
  } catch (error) {
    console.error(`[EXECUTOR] Workflow error:`, error);
    return {
      success: false,
      error: error.message,
      completedSteps: results.length,
    };
  }
}

export const httpRequestTool = tool({
  description: `Make HTTP API requests to any external service or website. Supports GET, POST, PUT, DELETE, PATCH.
Works with any public URL including APIs, websites, and web services.
Use for: fetching data, accessing APIs, retrieving web content, and more.`,

  parameters: z.object({
    url: z.string().url().describe("Full URL to request"),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
    headers: z.record(z.string()).optional(),
    body: z.any().optional(),
    auth: z
      .object({
        type: z.enum(["none", "bearer", "apiKey", "basic"]),
        token: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
      })
      .optional(),
    parseAs: z.enum(["json", "text"]).default("json"),
    userId: z.string().optional().describe("invoking user's Discord ID"),
    guildId: z.string().optional().describe("server ID"),
    username: z.string().optional().describe("invoking user's username"),
  }),

  execute: async (options) => {
    const result = await executeHttpRequest(options);
    return result;
  },
});

export const webFetchTool = tool({
  description: `Fetch and extract text content from any web page or API endpoint. Returns cleaned text without HTML tags.
Works with any public URL - websites, articles, documentation, APIs, and more.
Automatically handles both HTML pages and JSON responses.`,

  parameters: z.object({
    url: z.string().url().describe("Web page or API URL to fetch"),
    userId: z.string().optional().describe("invoking user's Discord ID"),
    guildId: z.string().optional().describe("server ID"),
    username: z.string().optional().describe("invoking user's username"),
  }),

  execute: async ({ url }) => {
    return await fetchWebPage(url);
  },
});

export const webSearchTool = tool({
  description: `Search the web for live, real-time, or factually grounded information.
ALWAYS use this when you are not 100% certain your answer is current and accurate. Never guess — search first.`,

  parameters: z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().min(1).max(10).default(5),
    userId: z.string().optional().describe("invoking user's Discord ID"),
    guildId: z.string().optional().describe("server ID"),
    username: z.string().optional().describe("invoking user's username"),
  }),

  execute: async ({ query, maxResults }) => {
    return await webSearch(query, { maxResults });
  },
});

export const workflowTool = tool({
  description: `Execute predefined workflows for common tasks.
Available workflows: ${Object.keys(WORKFLOWS).join(", ")}.
Each workflow runs a sequence of automated steps.`,

  parameters: z.object({
    workflowName: z
      .enum(Object.keys(WORKFLOWS))
      .describe("Workflow to execute"),
    context: z.record(z.any()).optional().describe("Context data for workflow"),
    userId: z.string().optional().describe("invoking user's Discord ID"),
    guildId: z.string().optional().describe("server ID"),
    username: z.string().optional().describe("invoking user's username"),
  }),

  execute: async ({ workflowName, context }) => {
    return await executeWorkflow(workflowName, context || {});
  },
});

export function getWorkflows() {
  return Object.entries(WORKFLOWS).map(([name, workflow]) => ({
    name,
    description: workflow.description,
    steps: workflow.steps.length,
  }));
}

export default {
  initializeExecutor,
  executeHttpRequest,
  fetchWebPage,
  webSearch,
  executeWorkflow,
  httpRequestTool,
  webFetchTool,
  webSearchTool,
  workflowTool,
  getWorkflows,
};
