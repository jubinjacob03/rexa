import { 
  MessageFlags, 
  ContainerBuilder, 
  TextDisplayBuilder, 
  SectionBuilder, 
  ThumbnailBuilder, 
  SeparatorBuilder, 
  SeparatorSpacingSize 
} from "discord.js";

export const EMBED_COLOR = 0x00ddff;
export const EPHEMERAL_COLOR = 0x2b2d31;

/**
 * Returns a configured V2 Container.
 * @param {string} title - Embed title
 * @param {string|null} description - Embed description (optional)
 * @param {{ fields?, footer?, thumbnail?, image?, timestamp? }} opts
 */
function buildV2Container(title, description = null, opts = {}, color = EMBED_COLOR) {
  const container = new ContainerBuilder().setAccentColor(color);

  // Combine title and description to eliminate awkward vertical gaps
  let bodyContent = "";
  if (title) bodyContent += `### ${title}\n`;
  if (description) {
    const descLines = description.split("\n").filter(l => l.trim());
    bodyContent += descLines.length > 1 ? descLines.map(l => l.trim()).join("\n") : description.trim();
  }
  bodyContent = bodyContent.trim();

  if (bodyContent) {
    if (opts.thumbnail) {
      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyContent))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(opts.thumbnail));
      container.addSectionComponents(section);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyContent));
    }
  }

  // Add fields with a subtle divider
  if (opts.fields && opts.fields.length > 0) {
    if (bodyContent) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      );
    }
    const fieldLines = opts.fields.map((f) => `**${f.name}**\n${f.value}`).join("\n\n");
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(fieldLines)
    );
  }

  // Clean, consistent footer
  const ts = Math.floor(Date.now() / 1000);
  const footerCustom = opts.footer?.text ? `${opts.footer.text} · ` : "";
  if (bodyContent || (opts.fields && opts.fields.length > 0)) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
  }
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${footerCustom}Shantha · <t:${ts}:f>`)
  );

  return container;
}

/**
 * Returns an ephemeral reply payload — use with interaction.reply() / followUp()
 * @param {string} title
 * @param {string|null} description
 * @param {object} opts
 */
export function eReply(title, description = null, opts = {}) {
  return {
    components: [buildV2Container(title, description, opts, EPHEMERAL_COLOR)],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

/**
 * Returns a public embed payload — use with channel.send() / editReply() / update()
 * @param {string} title
 * @param {string|null} description
 * @param {object} opts
 */
export function eSend(title, description = null, opts = {}) {
  return { 
    components: [buildV2Container(title, description, opts, EMBED_COLOR)],
    flags: MessageFlags.IsComponentsV2,
  };
}

export function addFooter(container) {
  const ts = Math.floor(Date.now() / 1000);
  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Shantha · <t:${ts}:f>`)
  );
  return container;
}
