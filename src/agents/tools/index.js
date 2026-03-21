import knowledgeBase from "./knowledge-base.js";
import contextManager from "./context-manager.js";
import executorTools from "./executor-tools.js";
import agentTools from "./agent-tools.js";
import * as discordTools from "./tools.js";

export async function initializeTools(client = null) {
  try {
    console.log("[TOOLS] Initializing all tools...");

    await knowledgeBase.initialize();

    if (contextManager.initialize) {
      await contextManager.initialize();
    }

    if (executorTools.initializeExecutor) {
      executorTools.initializeExecutor(client);
    }

    if (discordTools.initializeTools) {
      discordTools.initializeTools(client);
    }

    console.log("[TOOLS] All tools initialized successfully");
    return { success: true };
  } catch (error) {
    console.error("[TOOLS] Initialization error:", error);
    throw error;
  }
}

export const tools = {
  // Core tools
  createEmbed: agentTools.embedTool,
  ragQuery: knowledgeBase.ragTool,

  // Discord tools
  serverInfo: discordTools.serverInfoTool,
  executeCommand: discordTools.commandExecutorTool,
  musicControl: discordTools.musicControlTool,
  createPrivateVC: discordTools.createPrivateVCTool,

  // Web tools
  fetchWebPage: executorTools.webFetchTool,
  webSearch: executorTools.webSearchTool,
  executeWorkflow: executorTools.workflowTool,
  httpRequest: executorTools.httpRequestTool,
};

export {
  knowledgeBase,
  contextManager,
  executorTools,
  agentTools,
  discordTools,
};

export default {
  tools,
  initializeTools,
  knowledgeBase,
  contextManager,
  agentTools,
  executorTools,
  discordTools,
};
