import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with bot latency information'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(interaction.client.ws.ping);
        
        const embed = new EmbedBuilder()
            .setColor(apiLatency < 100 ? '#00FF00' : apiLatency < 200 ? '#FFD700' : '#FF0000')
            .setAuthor({ 
                name: '⚡ Shantha • Latency Check',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('# 🏓 PONG!')
            .setDescription('```ansi\n\u001b[36m╔═══════════════════════════════════╗\n\u001b[36m║  Connection Status & Latency      ║\n\u001b[36m╚═══════════════════════════════════╝\u001b[0m```')
            .addFields(
                {
                    name: '```╭──────────── LATENCY ─────────────────╮```',
                    value: '** **',
                    inline: false
                },
                {
                    name: '📡 Response Time',
                    value: `> **${latency}ms**`,
                    inline: true
                },
                {
                    name: '💓 API Latency',
                    value: `> **${apiLatency}ms**`,
                    inline: true
                },
                {
                    name: '```╰───────────────────────────────────────╯```',
                    value: '** **',
                    inline: false
                },
                {
                    name: '📊 Connection Status',
                    value: apiLatency < 100 
                        ? '> 🟢 **Excellent** — Lightning fast connection!' 
                        : apiLatency < 200 
                        ? '> 🟡 **Good** — Stable connection' 
                        : '> 🔴 **Slow** — Connection may be unstable',
                    inline: false
                }
            )
            .setFooter({ 
                text: `Requested by ${interaction.user.tag} • Powered by Shantha`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();
        
        await interaction.editReply({ content: null, embeds: [embed] });
    },
};

