import { Events } from 'discord.js';
import config from '../../config.js';

export default {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (config.imageOnlyChannels.includes(message.channel.id)) {
            if (message.attachments.size > 0) {
                return;
            }

            if (message.channel.id === '1473075469028167811') {
                const cleanContent = message.content
                    .replace(/<@!?\d+>/g, '') // Remove user mentions
                    .replace(/@everyone/g, '') // Remove @everyone
                    .replace(/@here/g, '') // Remove @here
                    .trim();

                const hasRoleMentions = /<@&\d+>/g.test(message.content);
                const hasChannelMentions = /<#\d+>/g.test(message.content);

                if (cleanContent === '' && !hasRoleMentions && !hasChannelMentions) {
                    return;
                }
            }
            try {
                await message.delete();
                const channelAllowsMentions = message.channel.id === '1473075469028167811';
                const notificationText = channelAllowsMentions
                    ? `<@${message.author.id}> ᴘʟᴇᴀsᴇ ᴜsᴇ ɢᴇɴᴇʀᴀʟ ᴄʜᴀᴛ ғᴏʀ sᴇɴᴅɪɴɢ ᴍᴇssᴀɢᴇs. ᴏɴʟʏ ᴍᴇᴅɪᴀ ᴀᴛᴛᴀᴄʜᴍᴇɴᴛs ᴀɴᴅ ᴍᴇɴᴛɪᴏɴs ᴀʀᴇ ᴀʟʟᴏᴡᴇᴅ.`
                    : `<@${message.author.id}> ᴘʟᴇᴀsᴇ ᴜsᴇ ɢᴇɴᴇʀᴀʟ ᴄʜᴀᴛ ғᴏʀ sᴇɴᴅɪɴɢ ᴍᴇssᴀɢᴇs. ᴏɴʟʏ ᴍᴇᴅɪᴀ ᴀᴛᴛᴀᴄʜᴍᴇɴᴛs ᴀʀᴇ ᴀʟʟᴏᴡᴇᴅ.`;
                
                const reply = await message.channel.send({
                    content: notificationText
                });

                setTimeout(() => {
                    reply.delete().catch(() => {});
                }, 5000);
                
                console.log(`[INFO] Deleted text message in image-only channel from ${message.author.tag}`);
            } catch (error) {
                console.error('[ERROR] Error deleting message in image-only channel:', error);
            }
        }
    }
};
