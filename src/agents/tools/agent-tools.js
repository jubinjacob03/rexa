import { tool } from "ai";
import { z } from "zod";
import { EmbedBuilder } from "discord.js";
import { sendPromptTunnel, getTunnel } from "../gemini-web-tunnel.js";

export const chatTool = tool({
  description: `Generate a comprehensive chat response using Google Gemini Pro (unlimited with Pro account).
    Use this for:
    - Complex reasoning and analysis
    - Malayalam/Manglish conversations (Gemini has excellent Indic language support)
    - Long-form explanations
    - Creative writing
    - Contextual conversations
    This tool accesses the unlimited Gemini Pro web interface, so use it freely without quota concerns.`,
  parameters: z.object({
    prompt: z.string().describe("The prompt/question to send to Gemini Pro"),
    context: z
      .string()
      .optional()
      .describe("Optional context from previous conversation"),
  }),
  execute: async ({ prompt, context }) => {
    try {
      console.log("[CHAT TOOL] Sending prompt to Gemini Pro...");

      // Add context if provided
      const fullPrompt = context
        ? `Previous context: ${context}\n\nUser: ${prompt}`
        : prompt;

      const response = await sendPromptTunnel(fullPrompt);

      console.log(`[CHAT TOOL] Received response (${response.length} chars)`);
      return response;
    } catch (error) {
      console.error("[CHAT TOOL] Error:", error);
      return `Error generating response: ${error.message}`;
    }
  },
});

export const imageTool = tool({
  description: `Generate images using Google Imagen through Gemini Pro web interface (unlimited with Pro account).
    Use this for:
    - Creating visual content
    - Illustrations and artwork
    - Diagrams and visualizations
    Provide detailed descriptions for best results.`,
  parameters: z.object({
    prompt: z
      .string()
      .describe("Detailed description of the image to generate"),
    aspectRatio: z
      .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
      .optional()
      .default("1:1")
      .describe("Image aspect ratio"),
  }),
  execute: async ({ prompt, aspectRatio }) => {
    try {
      console.log(
        "[IMAGE TOOL] Generating image via Gemini Pro web interface...",
      );

      // Get the tunnel instance
      const tunnel = await getTunnel();

      // Navigate to Gemini and request image generation
      const imagePrompt = `Generate an image: ${prompt}\nAspect ratio: ${aspectRatio}\n\n[Please generate this image]`;

      await tunnel.page.goto("https://gemini.google.com/app", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Type the image generation prompt
      await tunnel.page.waitForSelector(
        'div[contenteditable="true"], textarea',
        { timeout: 10000 },
      );
      await tunnel.page.type(
        'div[contenteditable="true"], textarea',
        imagePrompt,
        { delay: 10 },
      );

      // Press Enter to submit
      await tunnel.page.keyboard.press("Enter");

      // Wait for image generation (this may take time)
      console.log("[IMAGE TOOL] Waiting for image generation...");
      await new Promise((resolve) => setTimeout(resolve, 15000)); // Wait 15 seconds

      // Try to find and extract image URL
      const imageUrl = await tunnel.page.evaluate(() => {
        const images = document.querySelectorAll(
          'img[src*="googleusercontent"], img[src*="gemini"]',
        );
        if (images.length > 0) {
          return images[images.length - 1].src;
        }
        return null;
      });

      if (imageUrl) {
        console.log("[IMAGE TOOL] Image generated successfully");
        return `Image generated: ${imageUrl}`;
      } else {
        return "Image generation initiated. Please check the Gemini web interface for the result.";
      }
    } catch (error) {
      console.error("[IMAGE TOOL] Error:", error);
      return `Error generating image: ${error.message}`;
    }
  },
});

function parseColorValue(color) {
  if (!color) return 0x7289da; // Discord blurple default

  // If it's already a number, use it
  if (typeof color === "number") return color;

  // Parse hex string (#FF5733 or FF5733)
  if (typeof color === "string") {
    const hex = color.replace("#", "");
    const parsed = parseInt(hex, 16);
    if (!isNaN(parsed)) return parsed;
  }

  // Fallback to default
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
  chatTool,
  imageTool,
  embedTool,
  createDiscordEmbed,
};
