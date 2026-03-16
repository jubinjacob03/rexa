/**
 * Generative Tools - Image Generation & Discord Embed Generation
 * Creates visual content using AI models
 */

import { tool } from "ai";
import { z } from "zod";
import { EmbedBuilder } from "discord.js";
import config, { getImageModel } from "../config.js";

const imageCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const usageStats = {
  images: { total: 0, cached: 0 },
  embeds: { total: 0 },
};

/**
 * Quality presets for image generation
 */
const QUALITY_PRESETS = {
  fast: "imagen-4.0-fast-generate-001",
  balanced: "imagen-4.0-generate-001",
  ultra: "imagen-4.0-ultra-generate-001",
};

/**
 * Style enhancements for images
 */
const STYLE_PROMPTS = {
  realistic: "photorealistic, highly detailed, professional photography, 8k",
  anime: "anime style, vibrant colors, manga art, detailed character design",
  cartoon: "cartoon style, colorful, playful illustration, clean lines",
  "digital-art": "digital art, detailed, vibrant colors, artistic",
  photographic: "professional photograph, natural lighting, high resolution",
  painting: "oil painting style, artistic, brushstrokes visible",
  sketch: "pencil sketch, detailed line work, hand-drawn quality",
  "pixel-art": "16-bit pixel art, retro gaming aesthetic",
  "3d-render": "3D rendered, CGI, raytraced lighting",
  fantasy: "fantasy art, mystical, magical atmosphere",
  "sci-fi": "science fiction, futuristic, technological",
};

/**
 * Parse color value from various formats
 */
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

/**
 * Generate cache key
 */
function getCacheKey(prompt, options) {
  return `${prompt}:${JSON.stringify(options)}`;
}

/**
 * Check image cache
 */
function checkImageCache(cacheKey) {
  const cached = imageCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    imageCache.delete(cacheKey);
    return null;
  }

  usageStats.images.cached++;
  console.log("[GENERATIVE] Image cache hit");
  return cached;
}

/**
 * Generate AI image
 */
export async function generateAIImage(prompt, options = {}) {
  if (!config.imageGeneration.enabled) {
    return {
      success: false,
      error: "Image generation is disabled.",
      suggestion: "Set IMAGE_GENERATION_ENABLED=true in .env to enable.",
    };
  }

  const {
    quality = "balanced",
    style = "digital-art",
    size = "square",
    seed = null,
  } = options;

  const cacheKey = getCacheKey(prompt, { quality, style, size, seed });
  const cached = checkImageCache(cacheKey);
  if (cached) {
    return { ...cached.data, fromCache: true };
  }

  try {
    const imageModelConfig = getImageModel();

    if (imageModelConfig.provider === "google") {
      const model = QUALITY_PRESETS[quality] || config.imageGeneration.model;
      const styleEnhancement = STYLE_PROMPTS[style] || "";
      const enhancedPrompt = styleEnhancement
        ? `${prompt}, ${styleEnhancement}`
        : prompt;

      console.log(
        `[GENERATIVE] Generating image with Google Imagen 4: ${model}`,
      );

      const startTime = Date.now();
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${imageModelConfig.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt: enhancedPrompt }],
            parameters: { sampleCount: 1 },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Imagen API error: ${response.statusText}`);
      }

      const data = await response.json();
      const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded;

      if (!imageBase64) {
        throw new Error("No image generated");
      }

      const generationTime = Date.now() - startTime;
      usageStats.images.total++;

      const imageData = {
        success: true,
        url: `data:image/png;base64,${imageBase64}`,
        base64: imageBase64,
        prompt: enhancedPrompt,
        originalPrompt: prompt,
        style,
        quality,
        model,
        provider: "google-imagen",
        generationTime,
      };

      imageCache.set(cacheKey, { data: imageData, timestamp: Date.now() });
      return imageData;
    }

    // Pollinations.ai (FREE backup, no API key needed)
    if (imageModelConfig.provider === "pollinations") {
      const styleEnhancement = STYLE_PROMPTS[style] || "";
      const enhancedPrompt = styleEnhancement
        ? `${prompt}, ${styleEnhancement}`
        : prompt;

      console.log(`[GENERATIVE] Generating image with Pollinations.ai`);

      const encodedPrompt = encodeURIComponent(enhancedPrompt);
      const imageUrl = `${imageModelConfig.endpoint}${encodedPrompt}`;

      const startTime = Date.now();
      const generationTime = Date.now() - startTime;
      usageStats.images.total++;

      const imageData = {
        success: true,
        url: imageUrl,
        prompt: enhancedPrompt,
        originalPrompt: prompt,
        style,
        quality,
        provider: "pollinations",
        generationTime,
      };

      imageCache.set(cacheKey, { data: imageData, timestamp: Date.now() });
      return imageData;
    }

    throw new Error(`Unknown provider: ${imageModelConfig.provider}`);
  } catch (error) {
    console.error("[GENERATIVE] Image generation error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create Discord embed with rich formatting and modern design
 */
export function createDiscordEmbed(options) {
  const {
    title,
    description,
    color = "#7289da", // Discord blurple default
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

    // Parse and apply color (supports hex strings, decimal numbers, or direct values)
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

    usageStats.embeds.total++;

    console.log(`[GENERATIVE] Created Discord embed: ${title || "Untitled"}`);

    return {
      success: true,
      embed: embed.toJSON(),
      embedObject: embed,
      preview: `Embed: ${title || "Untitled"}${description ? " - " + description.substring(0, 50) : ""}`,
    };
  } catch (error) {
    console.error("[GENERATIVE] Embed creation error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Image Generation Tool for AI agent
 * Uses Google Imagen 4 (FREE!) or Pollinations.ai backup
 */
export const imageGenerationTool = tool({
  description: `Generate AI images using Google Imagen 4 (FREE with same API key) or Pollinations.ai backup.
Quality: fast, balanced, ultra
Styles: realistic, anime, cartoon, digital-art, photographic, painting, sketch, pixel-art, 3d-render, fantasy, sci-fi`,

  parameters: z.object({
    prompt: z.string().describe("Detailed image description"),
    quality: z.enum(["fast", "balanced", "ultra"]).default("balanced"),
    style: z
      .enum([
        "realistic",
        "anime",
        "cartoon",
        "digital-art",
        "photographic",
        "painting",
        "sketch",
        "pixel-art",
        "3d-render",
        "fantasy",
        "sci-fi",
      ])
      .default("digital-art"),
  }),

  execute: async ({ prompt, quality, style }) => {
    const result = await generateAIImage(prompt, { quality, style });

    if (result.success) {
      return {
        success: true,
        imageUrl: result.url,
        prompt: result.originalPrompt,
        enhancedPrompt: result.prompt,
        provider: result.provider,
        quality,
        style,
        generationTime: `${result.generationTime}ms`,
        fromCache: result.fromCache || false,
      };
    }

    return {
      success: false,
      error: result.error,
    };
  },
});

/**
 * Discord Embed Generator Tool for AI agent - Modern Material Design UI
 */
export const embedGeneratorTool = tool({
  description: `Create beautiful, modern Discord embeds with complete creative freedom.

USE EMBEDS FOR:
- Structured information (stats, lists, features)
- Important announcements or updates
- Rich responses with multiple sections
- Music info, server info, user profiles
- Success/error messages that need emphasis
- Visual appeal when plain text feels flat

COLORS - COMPLETE FREEDOM! Use ANY color:
- Hex strings: "#FF5733", "#00BFFF", "#FF1493", "#7FFF00"
- Match the vibe: warm = energy, cool = calm, bright = excitement
- Be contextual: music = vibrant, stats = professional, errors = reds, success = greens
- Get creative: gradients in mind, themes, moods - pick what feels perfect!

EMOJIS - BE EXPRESSIVE!
- Put emojis directly in titles: "yo here's the stats 📊"
- Use creative combos: "🔥🎵", "✨🎉", "🚀🌌"
- Match the mood: 😎 for cool, 🥳 for party, 💀 for gaming, 🌱 for fresh
- Be unique and creative - full emoji freedom!

Supports: title, description, fields, images, thumbnails, footers, author info, timestamps`,

  parameters: z.object({
    title: z.string().describe("Embed title (short and catchy with emojis)"),
    description: z
      .string()
      .optional()
      .describe("Main content (supports markdown formatting)"),
    color: z
      .string()
      .optional()
      .describe(
        "Any hex color you want! Examples: '#FF5733' (coral), '#00BFFF' (sky blue), '#FF1493' (hot pink), '#32CD32' (lime green). Be creative and match your message vibe!",
      ),
    fields: z
      .array(
        z.object({
          name: z.string().describe("Field title"),
          value: z.string().describe("Field content (supports markdown)"),
          inline: z
            .boolean()
            .optional()
            .describe("Display side-by-side (max 3 per row)"),
        }),
      )
      .optional()
      .describe("Additional structured fields"),
    thumbnail: z
      .string()
      .optional()
      .describe("Small image URL (top right corner)"),
    image: z
      .string()
      .optional()
      .describe("Large image URL (full width at bottom)"),
    footer: z.string().optional().describe("Small footer text"),
    author: z.string().optional().describe("Author name (displayed at top)"),
    url: z.string().optional().describe("Title clickable link URL"),
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

/**
 * Get available quality presets
 */
export function getQualityPresets() {
  return Object.entries(QUALITY_PRESETS).map(([name, preset]) => ({
    name,
    description: preset.description,
    model: preset.model,
  }));
}

/**
 * Get available styles
 */
export function getAvailableStyles() {
  return Object.keys(STYLE_PROMPTS);
}

/**
 * Get usage statistics
 */
export function getUsageStats() {
  return {
    ...usageStats,
    cacheSize: imageCache.size,
  };
}

/**
 * Clear image cache
 */
export function clearImageCache() {
  const size = imageCache.size;
  imageCache.clear();
  console.log(`[GENERATIVE] Cleared ${size} cached images`);
  return { success: true, cleared: size };
}

export default {
  generateAIImage,
  createDiscordEmbed,
  imageGenerationTool,
  embedGeneratorTool,
  getQualityPresets,
  getAvailableStyles,
  getUsageStats,
  clearImageCache,
};
