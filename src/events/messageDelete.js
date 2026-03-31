import { Events, AuditLogEvent } from "discord.js";
import { checkMessageDelete } from "../utils/automodRunner.js";

export default {
    name: Events.MessageDelete,
    async execute(message) {
        if (!message.guild || message.author?.bot) return;
        
        try {
            const fetchedLogs = await message.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.MessageDelete
            });
            const deletionLog = fetchedLogs.entries.first();
            if (!deletionLog) return;
            
            // If the executor exists and it's not the message author (i.e. mod deleted it for them)
            // wait, raid protection means someone rapidly deleting OTHERS messages or rapidly deleting their own.
            // If it's a mod abusing powers:
            const { executor } = deletionLog;
            await checkMessageDelete(message, executor);
            
        } catch (error) {
           // Ignore lacking permissions to fetch audit log silently 
        }
    }
};