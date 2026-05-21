import { tool } from "ai";
import { z } from "zod";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from "discord.js";

function parseColorValue(color) {
  if (!color) return 0x7289da;

  if (typeof color === "number") return color;

  if (typeof color === "string") {
    const hex = color.replace("#", "");
    const parsed = parseInt(hex, 16);
    if (!isNaN(parsed)) return parsed;
  }

  return 0x7289da;
}

export function createDiscordEmbed(options) {
  const {
    title,
    description,
    color = "#7289da",
    fields = [],
    thumbnail = null,
    image = null,
    footer = null,
    author = null,
    url = null,
    timestamp = true,
  } = options;

  try {
    const container = new ContainerBuilder();
    const colorValue = parseColorValue(color);
    container.setAccentColor(colorValue);

    let headerText = "";
    if (author) {
      const authorName = typeof author === "string" ? author : author.name;
      headerText += `-*${authorName}*-\n`;
    }
    if (title) headerText += `## ${title}\n`;
    if (description) headerText += `${description}`;

    if (headerText) {
      if (thumbnail) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(headerText.trim())
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
        container.addSectionComponents(section);
      } else {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(headerText.trim())
        );
      }
    }

    if (fields && Array.isArray(fields) && fields.length > 0) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      );
      fields.forEach((field) => {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${field.name}**\n${field.value}`)
        );
      });
    }

    if (image) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      );
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`[Image](${image})`)
      );
    }

    if (footer) {
      const footerText = typeof footer === "string" ? footer : footer.text;
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      );
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-*${footerText}*-`)
      );
    }

    console.log(`[EMBED] Created Discord container: ${title || "Untitled"}`);

    return {
      success: true,
      components: [container],
      preview: `Embed: ${title || "Untitled"}${description ? " - " + description.substring(0, 50) : ""}`,
    };
  } catch (error) {
    console.error("[EMBED] Creation error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export const embedTool = tool({
  description: `Create beautiful Discord embeds with complete creative freedom.

USE EMBEDS FOR:
- Structured information (stats, lists, features)
- Important announcements or updates
- Rich responses with multiple sections
- Success/error messages that need emphasis
- Visual appeal when plain text feels flat

DESIGN TIPS:
- Use ANY hex color: '#FF5733' (coral), '#00BFFF' (sky blue), '#FF1493' (hot pink)
- Add emojis in titles for flair (e.g. "🎉 Event Update")
- Use fields for organized data (inline=true for side-by-side)
- Keep it concise and visually appealing`,

  parameters: z.object({
    title: z.string().describe("Embed title (bold heading with emojis)"),
    description: z
      .string()
      .optional()
      .describe("Main text content (supports markdown)"),
    color: z
      .string()
      .optional()
      .describe("Hex color like '#FF5733' or '#00BFFF'"),
    fields: z
      .array(
        z.object({
          name: z.string().describe("Field title"),
          value: z.string().describe("Field content"),
          inline: z
            .boolean()
            .optional()
            .default(false)
            .describe("Show side-by-side (max 3 per row)"),
        }),
      )
      .optional()
      .describe("Organized data sections"),
    thumbnail: z.string().optional().describe("Small image URL (top right)"),
    image: z.string().optional().describe("Large image URL (bottom)"),
    footer: z.string().optional().describe("Footer text"),
    author: z.string().optional().describe("Author name (top)"),
    url: z.string().optional().describe("Title link URL"),
  }),

  execute: async (options) => {
    const result = createDiscordEmbed(options);

    if (result.success) {
      return {
        success: true,
        components: result.components,
        preview: result.preview,
      };
    }

    return {
      success: false,
      error: result.error,
    };
  },
});

export default {
  embedTool,
  createDiscordEmbed,
};
