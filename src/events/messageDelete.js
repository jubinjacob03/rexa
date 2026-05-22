import { Events, AuditLogEvent } from "discord.js";
import { checkMessageDelete } from "../utils/automodRunner.js";

export const ignoredDeletes = new Set();

/**
 * Handles the MessageDelete event.
 * @module events/messageDelete
 */
export default {
    name: Events.MessageDelete,
    /**
     * Executes the event handler.
     * @param {import("discord.js").Message} message - The message that was deleted.
     * @returns {Promise<void>}
     */
    async execute(message) {
        if (!message.guild || message.author?.bot) return;
        
        if (ignoredDeletes.has(message.id)) {
            ignoredDeletes.delete(message.id);
            return;
        }
        
        try {
            const fetchedLogs = await message.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageDelete
            });
            const deletionLog = fetchedLogs.entries.first();
            
            let executor = message.author;

            if (deletionLog && Date.now() - deletionLog.createdTimestamp < 5000) {
                if (deletionLog.target.id === message.author.id) {
                    executor = deletionLog.executor;
                }
            }
            
            if (executor.bot) return;

            await checkMessageDelete(message, executor);
            
        } catch {
        }
    }
};