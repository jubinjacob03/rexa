import knowledgeBase from "./knowledge-base.js";
import contextManager from "./context-manager.js";
import executorTools from "./executor-tools.js";
import agentTools from "./agent-tools.js";
import imageTool from "./image-tool.js";
import * as discordTools from "./tools.js";

export async function initializeTools(client = null) {
  try {
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

    return { success: true };
  } catch (error) {
    console.error("[TOOLS] Initialization error:", error);
    throw error;
  }
}

export const tools = {
  createEmbed: agentTools.embedTool,
  ragQuery: knowledgeBase.ragTool,
  escalateTicket: discordTools.escalateTicketTool,

  serverInfo: discordTools.serverInfoTool,
  executeCommand: discordTools.commandExecutorTool,
  musicControl: discordTools.musicControlTool,
  createPrivateVC: discordTools.createPrivateVCTool,
  deletePrivateVC: discordTools.deletePrivateVCTool,
  discordAction: discordTools.discordActionTool,

  fetchWebPage: executorTools.webFetchTool,
  webSearch: executorTools.webSearchTool,
  executeWorkflow: executorTools.workflowTool,
  httpRequest: executorTools.httpRequestTool,
  generateImage: imageTool.generateImageTool,
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
