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

            const friendsEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🌟 ғʀɪᴇɴᴅs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ')
                .setDescription('ᴀᴘᴘʟʏ ғᴏʀ **ғʀɪᴇɴᴅs** ʀᴏʟᴇ ᴛᴏ ᴀᴄᴄᴇss ʙᴀsɪᴄ sᴇʀᴠᴇʀ ғᴇᴀᴛᴜʀᴇs ᴀɴᴅ ᴄʜᴀɴɴᴇʟs.')
                .addFields(
                    { name: 'ᴘᴜʀᴘᴏsᴇ', value: 'ғᴏʀ ᴠɪsɪᴛᴏʀs', inline: true },
                    { name: 'ᴀᴄᴄᴇss ʟᴇᴠᴇʟ', value: 'ʙᴀsɪᴄ', inline: true },
                    { name: 'ᴘᴇʀᴍɪssɪᴏɴs', value: 'ʟɪᴍɪᴛᴇᴅ ᴄʜᴀɴɴᴇʟs', inline: true }
                )
                .setTimestamp();

            const friendsButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_friends')
                        .setLabel('ᴀᴘᴘʟʏ')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✅')
                );

            const memberEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('👑 ᴍᴇᴍʙᴇʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ')
                .setDescription('ᴀᴘᴘʟʏ ғᴏʀ **ᴍᴇᴍʙᴇʀ** ʀᴏʟᴇ ᴛᴏ ᴀᴄᴄᴇss ᴀʟʟ sᴇʀᴠᴇʀ ғᴇᴀᴛᴜʀᴇs ᴀɴᴅ ᴇxᴄʟᴜsɪᴠᴇ ᴄʜᴀɴɴᴇʟs.')
                .addFields(
                    { name: 'ᴘᴜʀᴘᴏsᴇ', value: 'ɢᴜɪʟᴅᴍᴀᴛᴇs', inline: true },
                    { name: 'ᴀᴄᴄᴇss ʟᴇᴠᴇʟ', value: 'ғᴜʟʟ ᴀᴄᴄᴇss', inline: true },
                    { name: 'ᴘᴇʀᴍɪssɪᴏɴs', value: 'ᴀʟʟ ᴄʜᴀɴɴᴇʟs', inline: true }
                )
                .setTimestamp();

            const memberButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_member')
                        .setLabel('ᴀᴘᴘʟʏ')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                );

            const messages = await verificationChannel.messages.fetch({ limit: 10 });
            let friendsMessage = null;
            let memberMessage = null;

            messages.forEach(msg => {
                if (msg.author.id === interaction.client.user.id && msg.embeds.length > 0) {
                    const embedTitle = msg.embeds[0].title;
                    if (embedTitle?.includes('ғʀɪᴇɴᴅs ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ')) {
                        friendsMessage = msg;
                    } else if (embedTitle?.includes('ᴍᴇᴍʙᴇʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ')) {
                        memberMessage = msg;
                    }
                }
            });

            if (friendsMessage) {
                await friendsMessage.edit({ embeds: [friendsEmbed], components: [friendsButton] });
                console.log('[INFO] Updated existing Friends verification embed');
            } else {
                await verificationChannel.send({ embeds: [friendsEmbed], components: [friendsButton] });
                console.log('[INFO] Created new Friends verification embed');
            }

            if (memberMessage) {
                await memberMessage.edit({ embeds: [memberEmbed], components: [memberButton] });
                console.log('[INFO] Updated existing Member verification embed');
            } else {
                await verificationChannel.send({ embeds: [memberEmbed], components: [memberButton] });
                console.log('[INFO] Created new Member verification embed');
            }

            const action = (friendsMessage || memberMessage) ? 'updated' : 'set up';
            await interaction.reply({ content: `✅ Verification embeds have been ${action} successfully!`, ephemeral: true });
        } catch (error) {
            console.error('[ERROR] Error setting up verification:', error);
            await interaction.reply({ content: '❌ Failed to set up verification embeds.', ephemeral: true });
        }
    }
};
