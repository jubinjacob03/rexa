import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows information about Shantha and available commands'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#00D9FF')
            .setAuthor({ 
                name: '⚡ Shantha • Help Center',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setDescription('```ansi\n\u001b[36m╔═════════════════════════════╗\n\u001b[36m║  Dashboard for Saiyan Gods  ║\n\u001b[36m╚═════════════════════════════╝\u001b[0m```')
            .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
            .addFields(
                {
                    name: '```╭─────── SERVER MONITORING ────────────╮```',
                    value: '** **',
                    inline: false
                },
                {
                    name: '📊 Real-time Tracking',
                    value: '> • Total member count\n> • Online members tracking\n> • Top roles by member count\n> • Available slash commands\n> • Auto-updating pinned status',
                    inline: false
                },
                {
                    name: '```╰───────────────────────────────────────╯```',
                    value: '** **',
                    inline: false
                },
                {
                    name: '```╭──────────── COMMANDS ────────────────╮```',
                    value: '** **',
                    inline: false
                },
                {
                    name: '⚡ Command List',
                    value: '> `/ping` — Check bot latency\n> `/refresh` — Manual refresh (Admin)\n> `/stats` — Detailed analytics\n> `/help` — Show this message',
                    inline: false
                },
                {
                    name: '```╰───────────────────────────────────────╯```',
                    value: '** **',
                    inline: false
                },
                {
                    name: '🔄 Auto-Updates',
                    value: '> Server info updates automatically every few minutes and when members join/leave the server.',
                    inline: false
                },
                {
                    name: '💡 Pro Tip',
                    value: '> The server dashboard is automatically pinned for quick access anytime!',
                    inline: false
                }
            )
            .setFooter({ 
                text: `Requested by ${interaction.user.tag} • Powered by Shantha`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};

