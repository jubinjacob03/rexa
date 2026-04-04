import { EmbedBuilder, MessageFlags } from "discord.js";

export const EMBED_COLOR = 0x00ddff;

/**
 * Returns a configured EmbedBuilder with the standard cyan color.
 * @param {string} title - Embed title
 * @param {string|null} description - Embed description (optional)
 * @param {{ fields?, footer?, thumbnail?, image?, timestamp? }} opts
 */
export function e(title, description = null, opts = {}) {
  const embed = new EmbedBuilder().setColor(EMBED_COLOR);
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (opts.fields) embed.addFields(...opts.fields);
  if (opts.footer) embed.setFooter(opts.footer);
  if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
  if (opts.image) embed.setImage(opts.image);
  if (opts.timestamp) embed.setTimestamp();
  return embed;
}

/**
 * Returns an ephemeral reply payload — use with interaction.reply() / followUp()
 * @param {string} title
 * @param {string|null} description
 * @param {object} opts
 */
export function eReply(title, description = null, opts = {}) {
  return {
    embeds: [e(title, description, opts)],
    flags: MessageFlags.Ephemeral,
  };
}

/**
 * Returns a public embed payload — use with channel.send() / editReply() / update()
 * @param {string} title
 * @param {string|null} description
 * @param {object} opts
 */
export function eSend(title, description = null, opts = {}) {
  return { embeds: [e(title, description, opts)] };
}
