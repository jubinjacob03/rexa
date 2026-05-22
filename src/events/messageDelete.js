import { Events, AuditLogEvent } from "discord.js";
import { checkMessageDelete } from "../utils/automodRunner.js";

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
        
        try {
            const fetchedLogs = await message.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageDelete
            });
            const deletionLog = fetchedLogs.entries.first();
            if (!deletionLog) return;
            
            const { executor } = deletionLog;
            await checkMessageDelete(message, executor);
            
        } catch {
           // Ignore lacking permissions to fetch audit log silently 
        }
    }
};