import { Events, AuditLogEvent } from "discord.js";
import { checkChannelDelete } from "../utils/automodRunner.js";

export default {
    name: Events.ChannelDelete,
    async execute(channel) {
        if (!channel.guild) return;
        
        try {
            const fetchedLogs = await channel.guild.fetchAuditLogs({
                limit: 1,
                type: AuditLogEvent.ChannelDelete
            });
            const deletionLog = fetchedLogs.entries.first();
            if (!deletionLog) return;
            
            const { executor, target } = deletionLog;
            if (target.id === channel.id) {
                await checkChannelDelete(channel, executor);
            }
        } catch (error) {
            console.error("[AutoMod] Error fetching audit logs for channel delete:", error.message);
        }
    }
};