/**
 * Shantha AI Agent System - Main Export
 */

import { initializeAgent, processMessage, executeCommand, getStats } from './agent.js';
import knowledgeBase from './tools/knowledge-base.js';
import contextManager from './tools/context-manager.js';
import config from './config.js';

/**
 * Initialize the complete agent system
 */
export async function initializeAgentSystem(discordClient) {
  console.log('[AGENT SYSTEM] Initializing...');
  
  const agent = await initializeAgent(discordClient);
  
  console.log(`[AGENT SYSTEM] Model: ${config.model.provider} - ${config.model.name}`);
  console.log(`[AGENT SYSTEM] RAG: ${config.rag.enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`[AGENT SYSTEM] Commands: ${config.commandExecution.enabled ? 'Enabled' : 'Disabled'}`);
  
  return agent;
}

export { processMessage, executeCommand, getStats, knowledgeBase, contextManager, config };

export default { initializeAgentSystem, processMessage, executeCommand, getStats };
