import { SlashCommandBuilder, MessageFlags } from "discord.js";
import {
  canCreate,
  activeCount,
  createPrivateVC,
  getVCByMember,
} from "../utils/privateVCManager.js";
import config from "../../config.js";
import { eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";

export default {
  data: new SlashCommandBuilder()
    .setName("vc")
    .setDescription("Create a private voice channel for selected members.")
    .addUserOption((o) =>
      o.setName("member1").setDescription("Member to invite").setRequired(true),
    )
    .addUserOption((o) =>
      o
        .setName("member2")
        .setDescription("Member to invite")
        .setRequired(false),
    )
    .addUserOption((o) =>
      o
        .setName("member3")
        .setDescription("Member to invite")
        .setRequired(false),
    )
    .addUserOption((o) =>
      o
        .setName("member4")
        .setDescription("Member to invite")
        .setRequired(false),
    )
    .addUserOption((o) =>
      o
        .setName("member5")
        .setDescription("Member to invite")
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const invoker = interaction.member;

    if (getVCByMember(invoker.id)) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ᴀʟʀᴇᴀᴅʏ ᴀᴄᴛɪᴠᴇ`,
          "ʏᴏᴜ ᴀʀᴇ ᴀʟʀᴇᴀᴅʏ ɪɴ ᴀ ᴘʀɪᴠᴀᴛᴇ ᴠᴄ. ʟᴇᴀᴠᴇ ɪᴛ ʙᴇғᴏʀᴇ ᴄʀᴇᴀᴛɪɴɢ ᴀ ɴᴇᴡ ᴏɴᴇ.",
        ),
      );
    }

    if (!canCreate()) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")}ʟɪᴍɪᴛ ʀᴇᴀᴄʜᴇᴅ`,
          `ᴍᴀxɪᴍᴜᴍ ᴏғ ${config.privateVC.maxSimultaneous} ᴘʀɪᴠᴀᴛᴇ ᴠᴄs ᴀʀᴇ ᴀʟʀᴇᴀᴅʏ ᴀᴄᴛɪᴠᴇ. ᴡᴀɪᴛ ғᴏʀ ᴏɴᴇ ᴛᴏ ᴇɴᴅ.`,
        ),
      );
    }

    const memberMap = new Map([[invoker.id, invoker]]);
    for (const key of ["member1", "member2", "member3", "member4", "member5"]) {
      const user = interaction.options.getUser(key);
      if (!user) continue;
      if (user.bot) continue;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) memberMap.set(member.id, member);
    }

    const members = [...memberMap.values()];

    const channel = await createPrivateVC(guild, members);
    if (!channel) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ғᴀɪʟᴇᴅ`,
          "ғᴀɪʟᴇᴅ ᴛᴏ ᴄʀᴇᴀᴛᴇ ᴘʀɪᴠᴀᴛᴇ ᴠᴄ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ.",
        ),
      );
    }

    const mentions = members
      .filter((m) => m.id !== invoker.id)
      .map((m) => `<@${m.id}>`)
      .join(", ");

    await interaction.editReply(
      eSend(
        `${i("DONE")} ᴘʀɪᴠᴀᴛᴇ ᴠᴄ ᴄʀᴇᴀᴛᴇᴅ`,
        `**${channel.name}** ɪs ʀᴇᴀᴅʏ!\nɪɴᴠɪᴛᴇᴅ: ${mentions || "ɴᴏ ᴏᴛʜᴇʀs"}\n\nᴍᴇᴍʙᴇʀs ɴᴏᴛ ɪɴ ᴠᴏɪᴄᴇ ᴡɪʟʟ ɴᴇᴇᴅ ᴛᴏ ᴊᴏɪɴ ᴍᴀɴᴜᴀʟʟʏ.`,
      ),
    );
  },
};
