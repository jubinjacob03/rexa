import { EmbedBuilder } from 'discord.js';
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
            // Use cached data if rate limited
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
    
    // Get key roles from config (by role ID)
    const importantRoles = [];
    if (config.keyRoles && config.keyRoles.length > 0) {
        for (const roleId of config.keyRoles) {
            const role = guild.roles.cache.get(roleId);
            if (role) {
                importantRoles.push(`${role} • **${role.members.size}** members`);
            }
        }
    } else {
        // If no roles configured, show top 5 roles
        const topRoles = guild.roles.cache
            .filter(role => role.id !== guild.id && !role.managed)
            .sort((a, b) => b.members.size - a.members.size)
            .first(5);
        topRoles.forEach(role => {
            importantRoles.push(`${role} • **${role.members.size}** members`);
        });
    }
    
    // Get all available commands from the guild
    const commands = await guild.commands.fetch();
    const commandList = commands.map(cmd => `\`/${cmd.name}\``).join(', ') || 'No commands registered yet';
    
    const embed = new EmbedBuilder()
        .setColor('#00D9FF')
        .setAuthor({ 
            name: '⚡ Shantha • Personal Assistant',
            iconURL: client.user.displayAvatarURL()
        })
        .setDescription('```ansi\n\u001b[36m╔═══════════════════════════════════╗\n\u001b[36m║   Saiyan Gods Server Dashboard    ║\n\u001b[36m╚═══════════════════════════════════╝\u001b[0m```')
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .addFields(
            {
                name: '```╭──────────────── MEMBERS ────────────────╮```',
                value: '** **',
                inline: false
            },
            {
                name: '👥 Members',
                value: `> **${totalMembers}** Total\n> **${humanCount}** Humans\n> **${botCount}** Bots`,
                inline: true
            },
            {
                name: '🟢 Activity',
                value: `> **${onlineMembers}** Online\n> **${totalMembers - onlineMembers}** Offline`,
                inline: true
            },
            {
                name: '```╰─────────────────────────────────────────╯```',
                value: '** **',
                inline: false
            },
            {
                name: '```╭───────────── SERVER INFO ──────────────╮```',
                value: '** **',
                inline: false
            },
            {
                name: '🌐 Details',
                value: `> **Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n> **Owner:** <@${guild.ownerId}>\n> **Dev:** <@882490956002242581>\n> **ID:** \`${guild.id}\``,
                inline: true
            },
            {
                name: '📊 Statistics',
                value: `> **${guild.roles.cache.size}** Roles\n> **${guild.channels.cache.size}** Channels`,
                inline: true
            },
            {
                name: '```╰─────────────────────────────────────────╯```',
                value: '** **',
                inline: false
            },
            {
                name: '```╭────────────── KEY ROLES ───────────────╮```',
                value: '** **',
                inline: false
            },
            {
                name: '🎭 Server Roles',
                value: importantRoles.length > 0 
                    ? '> ' + importantRoles.join('\n> ')
                    : '> *No key roles configured*',
                inline: false
            },
            {
                name: '```╰─────────────────────────────────────────╯```',
                value: '** **',
                inline: false
            },
            {
                name: '⚡ Available Commands',
                value: `> ${commandList || '*No commands available*'}`,
                inline: false
            }
        )
        .setFooter({ 
            text: `🔄 Auto-updates every ${config.updateInterval} min • Powered by Shantha`,
            iconURL: guild.iconURL()
        })
        .setTimestamp();
    
    // Add banner if available
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
        
        if (statusMessage) {
            try {
                await statusMessage.edit({ embeds: [embed] });
                console.log(`[INFO] Server info updated at ${new Date().toLocaleTimeString()}`);
            } catch (error) {
                console.error('[ERROR] Could not edit message, creating new one:', error.message);
                statusMessage = null;
            }
        }
        
        if (!statusMessage) {
            statusMessage = await channel.send({ embeds: [embed] });
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
    
    // Initial update
    updateStatusMessage(client);
    
    // Set up interval
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
