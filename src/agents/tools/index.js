/**
 * @file index.js
 * @description Entry point for all agent tools, handling initialization and exporting the unified tools object.
 */

import knowledgeBase from "./knowledge-base.js";
import contextManager from "./context-manager.js";
import executorTools from "./executor-tools.js";
import agentTools from "./agent-tools.js";
import * as discordTools from "./tools.js";

/**
 * Initializes all tools, including the knowledge base, context manager, and Discord-specific tools.
 * @param {object} [client=null] - The Discord client instance.
 * @returns {Promise<object>} The result of the initialization.
 */
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
  discordAction: discordTools.discordActionTool,

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
