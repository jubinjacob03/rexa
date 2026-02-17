import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import config from '../../config.js';
import * as verificationManager from './verificationManager.js';

export async function handleVerificationApply(interaction) {
    try {
        const userId = interaction.user.id;
        const username = interaction.user.tag;
        
        if (verificationManager.hasPendingRequest(userId)) {
            return interaction.reply({
                content: '⚠️ You already have a pending verification request. Please wait for approval.',
                ephemeral: true
            });
        }

        const isFriends = interaction.customId === 'verify_friends';
        const requestedRole = isFriends ? 'Friends' : 'Member';
        const requestedRoleId = isFriends ? config.friendsRoleId : config.memberRoleId;

        const approvalEmbed = new EmbedBuilder()
            .setColor(isFriends ? '#0099FF' : '#00FF00')
            .setTitle(`${isFriends ? '🌟' : '👑'} ɴᴇᴡ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ`)
            .setDescription(`<@${userId}> ʜᴀs ʀᴇǫᴜᴇsᴛᴇᴅ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ғᴏʀ **${requestedRole}** ʀᴏʟᴇ.`)
            .addFields(
                { name: 'ᴜsᴇʀ', value: `<@${userId}>`, inline: true },
                { name: 'ᴜsᴇʀɴᴀᴍᴇ', value: username, inline: true },
                { name: 'ʀᴇǫᴜᴇsᴛᴇᴅ ʀᴏʟᴇ', value: requestedRole, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `ᴜsᴇʀ ɪᴅ: ${userId}` });

        const approvalButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${userId}_${requestedRoleId}`)
                    .setLabel('ᴀᴘᴘʀᴏᴠᴇ')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`reject_${userId}_${requestedRoleId}`)
                    .setLabel('ʀᴇᴊᴇᴄᴛ')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        const approvalsChannel = await interaction.guild.channels.fetch(config.approvalsChannelId);
        const approvalMessage = await approvalsChannel.send({
            content: `<@&${config.ownerRoleId}> <@&${config.managerRoleId}> <@&${config.moderatorRoleId}>`,
            embeds: [approvalEmbed],
            components: [approvalButtons]
        });

        verificationManager.createRequest(userId, username, requestedRole, requestedRoleId, approvalMessage.id);

        await interaction.reply({
            content: `✅ Your verification request for **${requestedRole}** has been submitted. Please wait for approval.`,
            ephemeral: true
        });
        
    } catch (error) {
        console.error('[ERROR] Error handling verification apply:', error);
        await interaction.reply({
            content: '❌ Failed to submit verification request.',
            ephemeral: true
        });
    }
}

export async function handleApprovalAction(interaction) {
    try {
        const [action, userId, roleId] = interaction.customId.split('_');

        const request = verificationManager.getRequest(userId);
        if (!request) {
            return interaction.reply({
                content: '⚠️ This verification request no longer exists.',
                ephemeral: true
            });
        }

        const user = await interaction.client.users.fetch(userId);
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        
        if (!member) {
            verificationManager.removeRequest(userId);
            return interaction.reply({
                content: '❌ User is no longer in the server.',
                ephemeral: true
            });
        }
        
        if (action === 'approve') {
            const modal = new ModalBuilder()
                .setCustomId(`nickname_modal_${userId}_${roleId}`)
                .setTitle('sᴇᴛ sᴇʀᴠᴇʀ ɴɪᴄᴋɴᴀᴍᴇ');
            
            const nicknameInput = new TextInputBuilder()
                .setCustomId('nickname_input')
                .setLabel('ᴇɴᴛᴇʀ ᴛʜᴇ ɴᴀᴍᴇ ғᴏʀ "ɢᴏᴅ [ɴᴀᴍᴇ]" ғᴏʀᴍᴀᴛ')
                .setPlaceholder('ᴇxᴀᴍᴘʟᴇ: ᴊᴏʜɴ → ɢᴏᴅ ᴊᴏʜɴ')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(26);
            
            const row = new ActionRowBuilder().addComponents(nicknameInput);
            modal.addComponents(row);
            
            await interaction.showModal(modal);
            
        } else if (action === 'reject') {
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#FF0000')
                .setTitle('❌ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇᴊᴇᴄᴛᴇᴅ')
                .addFields({ name: 'ʀᴇᴊᴇᴄᴛᴇᴅ ʙʏ', value: `<@${interaction.user.id}>`, inline: true });
            
            await interaction.update({
                embeds: [originalEmbed],
                components: []
            });
            
            verificationManager.logApproval(
                userId,
                request.username,
                request.requestedRole,
                interaction.user.tag,
                interaction.user.id,
                null,
                'rejected'
            );
            
            verificationManager.removeRequest(userId);

            await user.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ sᴀɪʏᴀɴ ɢᴏᴅs - ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ғᴀɪʟᴇᴅ')
                        .setDescription(`sᴏʀʀʏ ᴛᴏ ɪɴғᴏʀᴍ ʏᴏᴜʀ ʀᴇǫᴜᴇsᴛ ғᴏʀ **${request.requestedRole}** ʀᴏʟᴇ ʜᴀs ʙᴇᴇɴ ʀᴇᴊᴇᴄᴛᴇᴅ.`)
                        .setTimestamp()
                ]
            }).catch(() => console.log(`[WARN] Could not DM user ${userId}`));
            
            await interaction.followUp({
                content: `✅ Verification request rejected and logged.`,
                ephemeral: true
            });
        }
        
    } catch (error) {
        console.error('[ERROR] Error handling approval action:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ Failed to process approval action.',
                ephemeral: true
            });
        }
    }
}

export async function handleNicknameModal(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        const [, , userId, roleId] = interaction.customId.split('_');
        const nicknameSuffix = interaction.fields.getTextInputValue('nickname_input');
        const finalNickname = `God ${nicknameSuffix}`;

        const request = verificationManager.getRequest(userId);
        if (!request) {
            return interaction.editReply({
                content: '⚠️ This verification request no longer exists.'
            });
        }

        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (!member) {
            verificationManager.removeRequest(userId);
            return interaction.editReply({
                content: '❌ User is no longer in the server.'
            });
        }

        await member.roles.remove(config.unverifiedRoleId);
        await member.roles.add(roleId);
        await member.setNickname(finalNickname);

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#00FF00')
            .setTitle('✅ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ')
            .addFields(
                { name: 'ᴀᴘᴘʀᴏᴠᴇᴅ ʙʏ', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'ɴɪᴄᴋɴᴀᴍᴇ', value: finalNickname, inline: true }
            );
        
        await interaction.message.edit({
            embeds: [originalEmbed],
            components: [] 
        });
        
        verificationManager.logApproval(
            userId,
            request.username,
            request.requestedRole,
            interaction.user.tag,
            interaction.user.id,
            finalNickname,
            'approved'
        );

        verificationManager.removeRequest(userId);

        const user = await interaction.client.users.fetch(userId);
        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ᴀᴘᴘʀᴏᴠᴇᴅ')
                    .setDescription(`ʏᴏᴜʀ ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ ʀᴇǫᴜᴇsᴛ ʜᴀs ʙᴇᴇɴ ᴀᴘᴘʀᴏᴠᴇᴅ!\n\n**ʀᴏʟᴇ:** ${request.requestedRole}\n**ɴɪᴄᴋɴᴀᴍᴇ:** ${finalNickname}`)
                    .setTimestamp()
            ]
        }).catch(() => console.log(`[WARN] Could not DM user ${userId}`));
        
        await interaction.editReply({
            content: `✅ Verification approved! User has been given **${request.requestedRole}** role with nickname **${finalNickname}**.`
        });
        
    } catch (error) {
        console.error('[ERROR] Error handling nickname modal:', error);
        await interaction.editReply({
            content: '❌ Failed to complete verification approval.'
        });
    }
}
