import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import config from '../../config.js';

let statusMessage = null;
let updateInterval = null;

/**
 * Creates the server information embed
 */
export async function createStatusEmbed(guild, client) {
    // Fetch all members to get accurate counts
    try {
        await guild.members.fetch();
    } catch (error) {
        if (error.code === 'RateLimitError' || error.name === 'GatewayRateLimitError') {
            console.log('[WARN] Rate limited, using cached member data for status update');
        } else {
            console.error('[ERROR] Failed to fetch members:', error);
        }
    }
    
    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter(member => member.user.bot).size;
    const humanCount = totalMembers - botCount;
    const onlineMembers = guild.members.cache.filter(
        member => member.presence?.status === 'online' || 
                  member.presence?.status === 'idle' || 
                  member.presence?.status === 'dnd'
    ).size;
    
    const embed = new EmbedBuilder()
        .setColor('#00FFFF')
        .setTitle('sᴇʀᴠᴇʀ sᴛᴀᴛs')
        .setDescription(
            ` • **${humanCount}** ᴍᴇᴍʙᴇʀs • **${botCount}** ʙᴏᴛs • **${guild.roles.cache.size}** ʀᴏʟᴇs • **${guild.channels.cache.size}** ᴄʜᴀɴɴᴇʟs\n\n` +
            `\`\`\`ansi\n\u001b[1;32m ${onlineMembers} ᴏɴʟɪɴᴇ \u001b[0m\`\`\` \`\`\`ansi\n\u001b[1;31m ${totalMembers - onlineMembers} ᴏғғʟɪɴᴇ \u001b[0m\`\`\`\u200b`
        )
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .setFooter({ 
            text: `ʟᴀsᴛ ᴜᴘᴅᴀᴛᴇᴅ`,
            iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();
    
    if (guild.banner) {
        embed.setImage(guild.bannerURL({ size: 1024 }));
    }
    
    return embed;
}

/**
 * Updates the server information message
 */
export async function updateStatusMessage(client) {
    try {
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) {
            console.error('[ERROR] Guild not found!');
            return;
        }
        
        const channel = guild.channels.cache.get(config.statusChannelId);
        if (!channel) {
            console.error('[ERROR] Server info channel not found!');
            return;
        }
        
        const embed = await createStatusEmbed(guild, client);
        
        const refreshButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('refresh_stats')
                    .setLabel('ʀᴇғʀᴇsʜ')
                    .setStyle(ButtonStyle.Primary)
            );
        
        if (!statusMessage) {
            try {
                const pinnedMessages = await channel.messages.fetchPinned();
                statusMessage = pinnedMessages.find(msg => 
                    msg.author.id === client.user.id && 
                    msg.embeds.length > 0 && 
                    msg.embeds[0].title === 'sᴇʀᴠᴇʀ sᴛᴀᴛs'
                );
                
                if (statusMessage) {
                    console.log('[INFO] Found existing stats message, will update it');
                }
            } catch (error) {
                console.error('[WARN] Could not fetch pinned messages:', error.message);
            }
        }
        
        if (statusMessage) {
            try {
                await statusMessage.edit({ embeds: [embed], components: [refreshButton] });
                console.log(`[INFO] Server info updated at ${new Date().toLocaleTimeString()}`);
            } catch (error) {
                console.error('[ERROR] Could not edit message, creating new one:', error.message);
                statusMessage = null;
            }
        }
        
        if (!statusMessage) {
            statusMessage = await channel.send({ embeds: [embed], components: [refreshButton] });
            await statusMessage.pin();
            console.log('[INFO] New server info message created and pinned!');
        }
    } catch (error) {
        console.error('[ERROR] Failed to update server info:', error);
    }
}

/**
 * Starts Shantha's server monitoring
 */
export function startStatusUpdater(client) {
    console.log(`[INFO] Shantha starting server monitoring (interval: ${config.updateInterval} minutes)`);
    
    updateStatusMessage(client);

    updateInterval = setInterval(() => {
        updateStatusMessage(client);
    }, config.updateInterval * 60 * 1000);
}

/**
 * Stops the server monitoring
 */
export function stopStatusUpdater() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
        console.log('[INFO] Server monitoring stopped');
    }
}

/**
 * Gets the current status message
 */
export function getStatusMessage() {
    return statusMessage;
}

/**
 * Sets the status message reference
 */
export function setStatusMessage(message) {
    statusMessage = message;
}
