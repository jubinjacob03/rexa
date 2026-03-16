/**
 * Tools Index - Consolidated export of all AI tools
 */

import knowledgeBase from './knowledge-base.js';
import contextManager from './context-manager.js';
import generativeTools from './generative-tools.js';
import executorTools from './executor-tools.js';

/**
 * Initialize all tools that need setup
 */
export async function initializeTools(client = null) {
  try {
    console.log('[TOOLS] Initializing all tools...');
    
    await knowledgeBase.initialize();
    
    if (contextManager.initialize) {
      await contextManager.initialize();
    }
    
    if (executorTools.initializeExecutor) {
      executorTools.initializeExecutor(client);
    }
    
    console.log('[TOOLS] All tools initialized successfully');
    return { success: true };
    
  } catch (error) {
    console.error('[TOOLS] Initialization error:', error);
    throw error;
  }
}

/**
 * All AI tools available to the agent
 */
export const tools = {
  ragQuery: knowledgeBase.ragTool,
  
  generateImage: generativeTools.imageGenerationTool,
  createEmbed: generativeTools.embedGeneratorTool,
  
  httpRequest: executorTools.httpRequestTool,
  fetchWebPage: executorTools.webFetchTool,
  webSearch: executorTools.webSearchTool,
  executeWorkflow: executorTools.workflowTool,
};

/**
 * Tool modules (for direct access to functions)
 */
export {
  knowledgeBase,
  contextManager,
  generativeTools,
  executorTools,
};

export default {
  tools,
  initializeTools,
  knowledgeBase,
  contextManager,
  generativeTools,
  executorTools,
};
