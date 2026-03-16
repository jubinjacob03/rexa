/**
 * Generative Tools - Image Generation & Discord Embed Generation
 * Creates visual content using AI models
 */

import { tool } from 'ai';
import { z } from 'zod';
import { generateImage } from 'ai';
import { EmbedBuilder } from 'discord.js';
import { openai } from '@ai-sdk/openai';
import config, { getImageModel } from '../config.js';

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
  ultra: {
    model: 'dall-e-3',
    settings: { providerOptions: { openai: { quality: 'hd', style: 'vivid' } } },
    description: 'Maximum quality (~30s, high cost)',
  },
  balanced: {
    model: 'dall-e-3',
    settings: { providerOptions: { openai: { quality: 'standard' } } },
    description: 'Good quality (~20s, medium cost)',
  },
  fast: {
    model: 'dall-e-2',
    settings: {},
    description: 'Fast generation (~10s, low cost)',
  },
};

/**
 * Style enhancements for images
 */
const STYLE_PROMPTS = {
  realistic: 'photorealistic, highly detailed, professional photography, 8k',
  anime: 'anime style, vibrant colors, manga art, detailed character design',
  cartoon: 'cartoon style, colorful, playful illustration, clean lines',
  'digital-art': 'digital art, detailed, vibrant colors, artistic',
  photographic: 'professional photograph, natural lighting, high resolution',
  painting: 'oil painting style, artistic, brushstrokes visible',
  sketch: 'pencil sketch, detailed line work, hand-drawn quality',
  'pixel-art': '16-bit pixel art, retro gaming aesthetic',
  '3d-render': '3D rendered, CGI, raytraced lighting',
  fantasy: 'fantasy art, mystical, magical atmosphere',
  'sci-fi': 'science fiction, futuristic, technological',
};

/**
 * Discord embed color presets
 */
const EMBED_COLORS = {
  blue: 0x3498db,
  green: 0x2ecc71,
  red: 0xe74c3c,
  purple: 0x9b59b6,
  gold: 0xf1c40f,
  orange: 0xe67e22,
  pink: 0xe91e63,
  cyan: 0x00bcd4,
  lime: 0xcddc39,
  indigo: 0x3f51b5,
  default: 0x7289da, // Discord blurple
};

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
  console.log('[GENERATIVE] Image cache hit');
  return cached;
}

/**
 * Generate AI image with quality presets
 * NOTE: Image generation REQUIRES OpenAI API key (NOT FREE)
 * This feature is disabled by default in config.js
 * To enable: Set IMAGE_GENERATION_ENABLED=true in .env and add OPENAI_API_KEY
 */
export async function generateAIImage(prompt, options = {}) {
  if (!config.imageGeneration.enabled) {
    return {
      success: false,
      error: 'Image generation is disabled. This feature requires a paid OpenAI API key.',
      suggestion: 'Enable it by setting IMAGE_GENERATION_ENABLED=true in .env and adding OPENAI_API_KEY',
    };
  }
  
  const {
    quality = 'balanced',
    style = 'digital-art',
    size = 'square',
    seed = null,
  } = options;
  
  const cacheKey = getCacheKey(prompt, { quality, style, size, seed });
  const cached = checkImageCache(cacheKey);
  if (cached) {
    return { ...cached.data, fromCache: true };
  }
  
  const preset = QUALITY_PRESETS[quality];
  if (!preset) {
    throw new Error(`Invalid quality: ${quality}. Use: ultra, balanced, fast`);
  }
  
  const styleEnhancement = STYLE_PROMPTS[style] || '';
  const enhancedPrompt = styleEnhancement 
    ? `${prompt}, ${styleEnhancement}`
    : prompt;
  
  const sizeMap = {
    square: '1024x1024',
    landscape: preset.model === 'dall-e-3' ? '1792x1024' : '1024x1024',
    portrait: preset.model === 'dall-e-3' ? '1024x1792' : '1024x1024',
  };
  
  try {
    console.log(`[GENERATIVE] Generating image: ${preset.model} (${quality})`);
    
    const startTime = Date.now();
    
    const result = await generateImage({
      model: openai.image(preset.model),
      prompt: enhancedPrompt,
      size: sizeMap[size],
      seed: seed || undefined,
      ...preset.settings,
    });
    
    const generationTime = Date.now() - startTime;
    usageStats.images.total++;
    
    const imageData = {
      success: true,
      image: result.image,
      prompt: enhancedPrompt,
      originalPrompt: prompt,
      style,
      quality,
      model: preset.model,
      generationTime,
      base64: result.image.base64,
      url: result.image.uint8Array ? `data:image/png;base64,${result.image.base64}` : null,
    };
    
    imageCache.set(cacheKey, {
      data: imageData,
      timestamp: Date.now(),
    });
    
    return imageData;
    
  } catch (error) {
    console.error('[GENERATIVE] Image generation error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create Discord embed with rich formatting
 */
export function createDiscordEmbed(options) {
  const {
    title,
    description,
    color = 'default',
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
    
    const colorValue = EMBED_COLORS[color.toLowerCase()] || color;
    embed.setColor(colorValue);
    
    if (fields && fields.length > 0) {
      fields.forEach(field => {
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
        typeof footer === 'string' 
          ? { text: footer }
          : { text: footer.text, iconURL: footer.icon }
      );
    }
    
    if (author) {
      embed.setAuthor(
        typeof author === 'string'
          ? { name: author }
          : { name: author.name, iconURL: author.icon, url: author.url }
      );
    }
    
    if (timestamp) embed.setTimestamp();
    
    usageStats.embeds.total++;
    
    console.log(`[GENERATIVE] Created Discord embed: ${title || 'Untitled'}`);
    
    return {
      success: true,
      embed: embed.toJSON(),
      embedObject: embed,
      preview: `Embed: ${title || 'Untitled'}${description ? ' - ' + description.substring(0, 50) : ''}`,
    };
    
  } catch (error) {
    console.error('[GENERATIVE] Embed creation error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Image Generation Tool for AI agent
 */
export const imageGenerationTool = tool({
  description: `Generate AI images from text descriptions. Supports multiple quality levels and artistic styles.
Quality options: ultra (best, slow), balanced (good, default), fast (quick, draft).
Style options: realistic, anime, cartoon, digital-art, photographic, painting, sketch, pixel-art, 3d-render, fantasy, sci-fi.`,
  
  parameters: z.object({
    prompt: z.string().describe('Detailed image description'),
    quality: z.enum(['ultra', 'balanced', 'fast']).default('balanced'),
    style: z.enum(['realistic', 'anime', 'cartoon', 'digital-art', 'photographic', 'painting', 'sketch', 'pixel-art', '3d-render', 'fantasy', 'sci-fi']).default('digital-art'),
    size: z.enum(['square', 'landscape', 'portrait']).default('square'),
    seed: z.number().optional().describe('Seed for reproducible generation'),
  }),
  
  execute: async ({ prompt, quality, style, size, seed }) => {
    const result = await generateAIImage(prompt, { quality, style, size, seed });
    
    if (result.success) {
      return {
        success: true,
        imageUrl: result.url,
        prompt: result.originalPrompt,
        enhancedPrompt: result.prompt,
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
 * Discord Embed Generator Tool for AI agent
 */
export const embedGeneratorTool = tool({
  description: `Create beautiful Discord embeds with rich formatting. Use for important messages, info cards, or structured data.
Colors: blue, green, red, purple, gold, orange, pink, cyan, lime, indigo, default.
Supports: title, description, fields, images, thumbnails, footers, author info.`,
  
  parameters: z.object({
    title: z.string().describe('Embed title'),
    description: z.string().optional().describe('Main content'),
    color: z.enum(['blue', 'green', 'red', 'purple', 'gold', 'orange', 'pink', 'cyan', 'lime', 'indigo', 'default']).default('default'),
    fields: z.array(z.object({
      name: z.string(),
      value: z.string(),
      inline: z.boolean().optional(),
    })).optional().describe('Additional fields'),
    thumbnail: z.string().optional().describe('Small image URL (top right)'),
    image: z.string().optional().describe('Large image URL (bottom)'),
    footer: z.string().optional().describe('Footer text'),
    author: z.string().optional().describe('Author name'),
    url: z.string().optional().describe('Title link URL'),
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
 * Get available embed colors
 */
export function getEmbedColors() {
  return Object.keys(EMBED_COLORS);
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
  getEmbedColors,
  getUsageStats,
  clearImageCache,
};
