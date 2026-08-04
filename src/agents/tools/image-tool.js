import { tool } from "ai";
import { z } from "zod";
import { AttachmentBuilder } from "discord.js";
import { createClient } from "@supabase/supabase-js";
import config from "../../../config.js";
import { icon } from "../../utils/icons.js";

const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DAILY_LIMIT = 10;

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function checkAndIncrementUsage(userId) {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("image_gen_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[ImageTool] Usage check error:", error.message);
    return { allowed: true, remaining: DAILY_LIMIT };
  }

  const currentCount = data?.count || 0;

  if (currentCount >= DAILY_LIMIT) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const resetTime = `<t:${Math.floor(tomorrow.getTime() / 1000)}:R>`;
    return { allowed: false, remaining: 0, resetTime };
  }

  await supabase
    .from("image_gen_usage")
    .upsert(
      { user_id: userId, date: today, count: currentCount + 1 },
      { onConflict: "user_id,date" },
    );

  return { allowed: true, remaining: DAILY_LIMIT - currentCount - 1 };
}

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
    prompt: z.string().describe("Pass the user's image prompt EXACTLY as they wrote it. Do NOT rewrite, sanitize, or enhance it."),
    referenceImages: z.array(z.string().url()).optional().describe("URLs of reference images to edit or use as context. From user attachments."),
    aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().describe("Aspect ratio. Default 1:1. Use 9:16 for portraits, 16:9 for landscapes."),
    userId: z.string().optional(),
    guildId: z.string().optional(),
    username: z.string().optional(),
  }),

  execute: async ({ prompt, referenceImages, aspectRatio, userId }) => {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Image generation API key not configured." };
    }

    if (userId && userId !== "882490956002242581") {
      const usage = await checkAndIncrementUsage(userId);
      if (!usage.allowed) {
        return {
          success: false,
          error: `${icon("WARNING")} Daily image generation limit reached (${DAILY_LIMIT}/${DAILY_LIMIT}). Resets ${usage.resetTime}.`,
        };
      }
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
              ...(aspectRatio && { imageConfig: { aspectRatio } }),
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
        const blockReason = data?.candidates?.[0]?.finishReason;
        const safetyRatings = data?.candidates?.[0]?.safetyRatings || data?.promptFeedback?.safetyRatings;
        const blockedCategory = safetyRatings?.find((r) => r.blocked || r.probability === "HIGH")?.category;

        let errorMsg;
        if (blockReason === "SAFETY" || blockedCategory) {
          const categoryMap = {
            HARM_CATEGORY_SEXUALLY_EXPLICIT: "sexually explicit content",
            HARM_CATEGORY_HATE_SPEECH: "hate speech",
            HARM_CATEGORY_HARASSMENT: "harassment",
            HARM_CATEGORY_DANGEROUS_CONTENT: "dangerous content",
            HARM_CATEGORY_CIVIC_INTEGRITY: "civic integrity violation",
          };
          const reason = categoryMap[blockedCategory] || "safety policy violation";
          errorMsg = `${icon("WARNING")} Image blocked by Google's safety filters: **${reason}**. This includes real public figures, celebrities, and inappropriate content.`;
        } else if (textPart?.text) {
          errorMsg = `${icon("WARNING")} Image generation refused: ${textPart.text}`;
        } else if (blockReason) {
          errorMsg = `${icon("WARNING")} Image blocked (reason: ${blockReason}). Try a different prompt — real people and sensitive content are not allowed.`;
        } else {
          errorMsg = `${icon("WARNING")} No image was generated. This usually means the prompt involves a real person or violates content policies. Try a different prompt.`;
        }

        return { success: false, error: errorMsg };
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
