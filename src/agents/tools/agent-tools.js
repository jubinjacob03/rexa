import { tool } from "ai";
import { z } from "zod";
import { EmbedBuilder } from "discord.js";

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
    const embed = new EmbedBuilder();

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (url) embed.setURL(url);

    const colorValue = parseColorValue(color);
    embed.setColor(colorValue);

    if (fields && fields.length > 0) {
      fields.forEach((field) => {
        embed.addFields({
          name: field.name,
          value: field.value,
          inline: field.inline !== false,
        });
      });
    }

    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);

    if (footer) {
      embed.setFooter(
        typeof footer === "string"
          ? { text: footer }
          : { text: footer.text, iconURL: footer.icon },
      );
    }

    if (author) {
      embed.setAuthor(
        typeof author === "string"
          ? { name: author }
          : { name: author.name, iconURL: author.icon, url: author.url },
      );
    }

    if (timestamp) embed.setTimestamp();

    console.log(`[EMBED] Created Discord embed: ${title || "Untitled"}`);

    return {
      success: true,
      embed: embed.toJSON(),
      embedObject: embed,
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
- Add emojis in titles: "Stats 📊", "Success! ✅", "Error! ❌"
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
        embed: result.embed,
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
