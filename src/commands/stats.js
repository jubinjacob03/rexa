import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View detailed server information and analytics'),
    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            const guild = interaction.guild;
            
            // Try to fetch members, but use cache if rate limited
            try {
                await guild.members.fetch();
            } catch (error) {
                if (error.code === 'RateLimitError' || error.name === 'GatewayRateLimitError') {
                    // Use cached data if rate limited
                    console.log('[WARN] Rate limited, using cached member data');
                } else {
                    throw error;
                }
            }
            
            const totalMembers = guild.memberCount;
            const bots = guild.members.cache.filter(member => member.user.bot).size;
            const humans = totalMembers - bots;
            
            const onlineMembers = guild.members.cache.filter(m => m.presence?.status === 'online').size;
            const idleMembers = guild.members.cache.filter(m => m.presence?.status === 'idle').size;
            const dndMembers = guild.members.cache.filter(m => m.presence?.status === 'dnd').size;
            const offlineMembers = totalMembers - (onlineMembers + idleMembers + dndMembers);
            
            const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
            const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
            const categories = guild.channels.cache.filter(c => c.type === 4).size;
            
            const roles = guild.roles.cache.size - 1; // Exclude @everyone
            const emojis = guild.emojis.cache.size;
            const boostLevel = guild.premiumTier;
            const boostCount = guild.premiumSubscriptionCount || 0;
            
            const embed = new EmbedBuilder()
                .setColor('#00D9FF')
                .setAuthor({ 
                    name: '⚡ Shantha • Analytics Dashboard',
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTitle(`# 📊 ${guild.name.toUpperCase()}`)
                .setDescription('```ansi\n\u001b[36m╔═══════════════════════════════════╗\n\u001b[36m║  Complete Server Analytics        ║\n\u001b[36m╚═══════════════════════════════════╝\u001b[0m```')
                .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
                .addFields(
                    {
                        name: '```╭────────────── MEMBER ANALYTICS ───────────────╮```',
                        value: '** **',
                        inline: false
                    },
                    {
                        name: '👥 Breakdown',
                        value: `> **${totalMembers}** Total Members\n> **${humans}** Humans\n> **${bots}** Bots`,
                        inline: true
                    },
                    {
                        name: '🟢 Presence',
                        value: `> 🟢 **${onlineMembers}** Online\n> 🔴 **${dndMembers}** DND\n> ⚫ **${offlineMembers}** Offline`,
                        inline: true
                    },
                    {
                        name: '```╰───────────────────────────────────────────────╯```',
                        value: '** **',
                        inline: false
                    },
                    {
                        name: '```╭────────────────── CHANNELS ─────────────────────╮```',
                        value: '** **',
                        inline: false
                    },
                    {
                        name: '📝 Channel Stats',
                        value: `> 💬 **${textChannels}** Text Channels\n> 🔊 **${voiceChannels}** Voice Channels\n> 📁 **${categories}** Categories`,
                        inline: true
                    },
                    {
                        name: '🎭 Server Details',
                        value: `> **${roles}** Roles\n> 🚀 Boost **Level ${boostLevel}**\n> 💎 **${boostCount}** Boosts`,
                        inline: true
                    },
                    {
                        name: '```╰─────────────────────────────────────────────────╯```',
                        value: '** **',
                        inline: false
                    },
                    {
                        name: '```╭────────────────── SERVER INFO ───────────────────╮```',
                        value: '** **',
                        inline: false
                    },
                    {
                        name: '📅 Created',
                        value: `> <t:${Math.floor(guild.createdTimestamp / 1000)}:F>\n> <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
                        inline: true
                    },
                    {
                        name: '👑 Owner',
                        value: `> **Server:** <@${guild.ownerId}>\n> **Dev:** <@882490956002242581>`,
                        inline: true
                    },
                    {
                        name: '```╰───────────────────────────────────────────────────╯```',
                        value: '** **',
                        inline: false
                    }
                )
                .setFooter({ 
                    text: `Server ID: ${guild.id} • Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();
            
            if (guild.banner) {
                embed.setImage(guild.bannerURL({ size: 1024 }));
            }
            
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[ERROR] Error executing stats command:', error);
            const errorMessage = error.name === 'GatewayRateLimitError' 
                ? '⚠️ Too many requests! Please wait a few seconds and try again.'
                : '❌ An error occurred while fetching server statistics.';
            
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    },
};

