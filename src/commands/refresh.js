import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { updateStatusMessage } from '../utils/statusUpdater.js';

export default {
    data: new SlashCommandBuilder()
        .setName('refresh')
        .setDescription('Manually refresh the server information message')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            await updateStatusMessage(interaction.client);
            await interaction.editReply('✅ Server information has been refreshed!');
        } catch (error) {
            console.error('[ERROR] Failed to refresh status:', error);
            await interaction.editReply('❌ Failed to refresh server information. Check console for details.');
        }
    },
};
