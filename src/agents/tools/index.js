import knowledgeBase from "./knowledge-base.js";
import contextManager from "./context-manager.js";
import executorTools from "./executor-tools.js";
import agentTools from "./agent-tools.js";

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

    console.log("[TOOLS] All tools initialized successfully");
    return { success: true };
  } catch (error) {
    console.error("[TOOLS] Initialization error:", error);
    throw error;
  }
}

export const tools = {
  createEmbed: agentTools.embedTool,
  generateImage: agentTools.imageTool,
  ragQuery: knowledgeBase.ragTool,
  httpRequest: executorTools.httpRequestTool,
  fetchWebPage: executorTools.webFetchTool,
  webSearch: executorTools.webSearchTool,
  executeWorkflow: executorTools.workflowTool,
};

export { knowledgeBase, contextManager, executorTools, agentTools };

export default {
  tools,
  initializeTools,
  knowledgeBase,
  contextManager,
  agentTools,
  executorTools,
};
