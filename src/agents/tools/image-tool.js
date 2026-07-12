import { tool } from "ai";
import { z } from "zod";
import { AttachmentBuilder } from "discord.js";

const GEMINI_IMAGE_MODEL = "gemini-2.0-flash-exp";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/png";
  return { data: buffer.toString("base64"), mimeType };
}

export const generateImageTool = tool({
  description: `Generate or edit an image using Gemini's native image generation (Nano Banana).
Use this when the user asks to create, generate, draw, make, edit, modify, or transform an image/picture/photo/illustration.
If the user provides reference image URLs, include them in referenceImages to edit or use as style/subject reference.`,

  parameters: z.object({
    prompt: z.string().describe("Detailed description of the image to generate or the edit instruction."),
    referenceImages: z.array(z.string().url()).optional().describe("URLs of reference images to edit or use as context. From user attachments."),
    aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().describe("Aspect ratio. Default 1:1. Use 9:16 for portraits, 16:9 for landscapes."),
    userId: z.string().optional(),
    guildId: z.string().optional(),
    username: z.string().optional(),
  }),

  execute: async ({ prompt, referenceImages, aspectRatio }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Image generation API key not configured." };
    }

    try {
      const parts = [];

      if (referenceImages?.length > 0) {
        for (const url of referenceImages.slice(0, 5)) {
          const imgData = await fetchImageAsBase64(url);
          if (imgData) {
            parts.push({ inlineData: { mimeType: imgData.mimeType, data: imgData.data } });
          }
        }
      }

      parts.push({ text: prompt });

      const response = await fetch(
        `${API_BASE}/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              ...(aspectRatio && { aspectRatio }),
            },
          }),
        },
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err?.error?.message || `API returned ${response.status}`;
        return { success: false, error: `Image generation failed: ${msg}` };
      }

      const data = await response.json();
      const responseParts = data?.candidates?.[0]?.content?.parts || [];
      const imagePart = responseParts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));

      if (!imagePart) {
        const textPart = responseParts.find((p) => p.text);
        return {
          success: false,
          error: textPart?.text || "No image was generated. Try a different prompt.",
        };
      }

      const buffer = Buffer.from(imagePart.inlineData.data, "base64");
      const ext = imagePart.inlineData.mimeType === "image/png" ? "png" : "jpg";
      const attachment = new AttachmentBuilder(buffer, { name: `generated.${ext}` });

      return {
        success: true,
        message: `Generated image for: *${prompt.slice(0, 100)}${prompt.length > 100 ? "..." : ""}*`,
        files: [attachment],
      };
    } catch (error) {
      return { success: false, error: `Image generation error: ${error.message}` };
    }
  },
});

export default { generateImageTool };
