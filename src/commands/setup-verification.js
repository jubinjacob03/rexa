import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import config from '../../config.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setup-verification')
        .setDescription('Set up verification embeds in the verification channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        try {
            const verificationChannel = await interaction.guild.channels.fetch(config.verificationChannelId);
            
            if (!verificationChannel) {
                return interaction.reply({ content: '❌ Verification channel not found!', ephemeral: true });
            }

            const verificationEmbed = new EmbedBuilder()
                .setColor('#00ddff')
                .setTitle('🔐 ʀᴏʟᴇ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ')
                .setDescription('ᴄʟɪᴄᴋ ᴏɴ ᴛʜᴇ ᴀᴘᴘʀᴏᴘʀɪᴀᴛᴇ ʀᴏʟᴇ ʏᴏᴜ ᴡᴀɴᴛ ᴛᴏ ᴀᴘᴘʟʏ. ⚠️ **ᴍᴇᴍʙᴇʀ ɪs ғᴏʀ ɢᴜɪʟᴅᴍᴀᴛᴇs ᴏɴʟʏ!!**')
                .setTimestamp();

            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_friends')
                        .setLabel('ғʀɪᴇɴᴅs')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('verify_member')
                        .setLabel('ᴍᴇᴍʙᴇʀ')
                        .setStyle(ButtonStyle.Success)
                );

            const messages = await verificationChannel.messages.fetch({ limit: 10 });
            let existingMessage = null;

            messages.forEach(msg => {
                if (msg.author.id === interaction.client.user.id && msg.embeds.length > 0) {
                    const embedTitle = msg.embeds[0].title;
                    if (embedTitle?.includes('Role Verification') || 
                        embedTitle?.includes('ғʀɪᴇɴᴅs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ') || 
                        embedTitle?.includes('ᴍᴇᴍʙᴇʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ')) {
                        if (!existingMessage) existingMessage = msg;
                    }
                }
            });

            if (existingMessage) {
                await existingMessage.edit({ embeds: [verificationEmbed], components: [buttonRow] });
                console.log('[INFO] Updated existing verification embed');
                
                const oldMessages = messages.filter(msg => 
                    msg.id !== existingMessage.id &&
                    msg.author.id === interaction.client.user.id && 
                    msg.embeds.length > 0 &&
                    (msg.embeds[0].title?.includes('ғʀɪᴇɴᴅs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ') || 
                     msg.embeds[0].title?.includes('ᴍᴇᴍʙᴇʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ'))
                );
                
                for (const msg of oldMessages.values()) {
                    await msg.delete().catch(() => {});
                    console.log('[INFO] Deleted old verification embed');
                }
                
                await interaction.reply({ content: '✅ Verification embed updated successfully!', ephemeral: true });
            } else {
                await verificationChannel.send({ embeds: [verificationEmbed], components: [buttonRow] });
                console.log('[INFO] Created new verification embed');
                await interaction.reply({ content: '✅ Verification embed set up successfully!', ephemeral: true });
            }
        } catch (error) {
            console.error('[ERROR] Error setting up verification:', error);
            await interaction.reply({ content: '❌ Failed to set up verification embed.', ephemeral: true });
        }
    }
};
