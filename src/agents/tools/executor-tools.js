/**
 * Executor Tools - Predefined Flows, HTTP Calls, Web Fetch & Search
 * Handles external interactions and automated workflows
 */

import { tool } from "ai";
import { z } from "zod";
import config from "../config.js";

const HTTP_CONFIG = {
  timeout: 10000,
  maxResponseSize: 5242880, // 5MB
  maxRetries: 3,
  retryDelay: 1000,
  allowAllDomains: true, // Allow fetching from any URL
  blockedDomains: process.env.HTTP_TOOL_BLOCKED_DOMAINS?.split(",") || [],
  rateLimit: 60,
};

const rateLimitTracker = new Map();

let discordClient = null;

/**
 * Initialize with Discord client
 */
export function initializeExecutor(client) {
  discordClient = client;
  console.log("[EXECUTOR] Initialized with Discord client");
}

/**
 * Predefined workflow definitions
 */
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

/**
 * Check if domain is allowed
 */
function isAllowedDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0"
    ) {
      return process.env.NODE_ENV === "development";
    }
    if (
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.")
    ) {
      return process.env.NODE_ENV === "development";
    }

    if (HTTP_CONFIG.blockedDomains.length > 0) {
      const isBlocked = HTTP_CONFIG.blockedDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      );
      if (isBlocked) return false;
    }
    return HTTP_CONFIG.allowAllDomains;
  } catch {
    return false;
  }
}

/**
 * Check rate limit
 */
function checkRateLimit(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const now = Date.now();
    const minute = 60000;

    if (!rateLimitTracker.has(domain)) {
      rateLimitTracker.set(domain, []);
    }

    const requests = rateLimitTracker.get(domain);
    const recentRequests = requests.filter((time) => now - time < minute);
    rateLimitTracker.set(domain, recentRequests);

    if (recentRequests.length >= HTTP_CONFIG.rateLimit) {
      return {
        allowed: false,
        resetIn: minute - (now - recentRequests[0]),
      };
    }

    recentRequests.push(now);
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
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

/**
 * Execute HTTP request
 */
export async function executeHttpRequest(options, retryCount = 0) {
  const {
    url,
    method = "GET",
    headers = {},
    body = null,
    auth = null,
    timeout = HTTP_CONFIG.timeout,
    parseAs = "json",
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

    const response = await fetchWithTimeout(url, requestOptions, timeout);

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

    if (retryCount < HTTP_CONFIG.maxRetries) {
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

/**
 * Fetch and parse a web page
 */
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

    // Handle JSON responses
    if (typeof content === "object") {
      content = JSON.stringify(content, null, 2);
      title = "JSON Response";
    } else if (typeof content !== "string") {
      content = String(content);
    }

    // If it looks like HTML, parse it
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

/**
 * Web search using DuckDuckGo
 */
export async function webSearch(query, options = {}) {
  const { maxResults = 5 } = options;

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

    const result = await executeHttpRequest({
      url,
      method: "GET",
      parseAs: "json",
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

/**
 * Execute predefined workflow
 */
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

/**
 * HTTP Request Tool for AI agent
 */
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
  }),

  execute: async (options) => {
    const result = await executeHttpRequest(options);
    return result;
  },
});

/**
 * Web Fetch Tool for AI agent
 */
export const webFetchTool = tool({
  description: `Fetch and extract text content from any web page or API endpoint. Returns cleaned text without HTML tags.
Works with any public URL - websites, articles, documentation, APIs, and more.
Automatically handles both HTML pages and JSON responses.`,

  parameters: z.object({
    url: z.string().url().describe("Web page or API URL to fetch"),
  }),

  execute: async ({ url }) => {
    return await fetchWebPage(url);
  },
});

/**
 * Web Search Tool for AI agent
 */
export const webSearchTool = tool({
  description: `Search the web using DuckDuckGo. Get instant answers and related topics.
Use when you need current information or facts not in your knowledge base.`,

  parameters: z.object({
    query: z.string().describe("Search query"),
    maxResults: z.number().min(1).max(10).default(5),
  }),

  execute: async ({ query, maxResults }) => {
    return await webSearch(query, { maxResults });
  },
});

/**
 * Workflow Executor Tool for AI agent
 */
export const workflowTool = tool({
  description: `Execute predefined workflows for common tasks.
Available workflows: ${Object.keys(WORKFLOWS).join(", ")}.
Each workflow runs a sequence of automated steps.`,

  parameters: z.object({
    workflowName: z
      .enum(Object.keys(WORKFLOWS))
      .describe("Workflow to execute"),
    context: z.record(z.any()).optional().describe("Context data for workflow"),
  }),

  execute: async ({ workflowName, context }) => {
    return await executeWorkflow(workflowName, context || {});
  },
});

/**
 * Get available workflows
 */
export function getWorkflows() {
  return Object.entries(WORKFLOWS).map(([name, workflow]) => ({
    name,
    description: workflow.description,
    steps: workflow.steps.length,
  }));
}

/**
 * Get allowed domains
 */
export function getAllowedDomains() {
  return HTTP_CONFIG.allowedDomains;
}

/**
 * Add allowed domain
 */
export function addAllowedDomain(domain) {
  if (!HTTP_CONFIG.allowedDomains.includes(domain)) {
    HTTP_CONFIG.allowedDomains.push(domain);
    console.log(`[EXECUTOR] Added allowed domain: ${domain}`);
  }
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
  getAllowedDomains,
  addAllowedDomain,
};
