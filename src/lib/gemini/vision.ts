import "server-only";
import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { CATEGORIES } from "@/lib/types";

// Server-only Gemini implementation of item detection from photos. The
// `server-only` import makes an accidental client-component import of this
// module a build error — GEMINI_API_KEY must never reach the browser.
//
// This is the active implementation (see lib/ai.ts's `visionProvider`),
// called via /api/v1/vision/detect rather than imported directly by any
// client component.

const GEMINI_MODEL = "gemini-flash-latest";

const detectionSchema = z.object({
  items: z.array(
    z.object({
      suggestedName: z.string().describe("A concise, human-readable name for the item, e.g. 'Cordless Drill'."),
      category: z.enum([...CATEGORIES] as [string, ...string[]]),
      suggestedTags: z.array(z.string()).describe("0-3 short lowercase tags, e.g. 'power-tools'."),
      confidence: z.number().min(0).max(1).describe("How confident you are in the identification, 0-1."),
      photoEmoji: z.string().describe("A single emoji that best represents this item."),
    })
  ),
});

export type GeminiDetectedItem = z.infer<typeof detectionSchema>["items"][number];

function google() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  return createGoogleGenerativeAI({ apiKey });
}

/**
 * Detects items across one or more photos in a single Gemini call. Photos are
 * data URLs (e.g. from a camera capture), passed inline — no persistent file
 * upload needed for this one-shot use case.
 */
export async function detectItemsWithGemini(photos: string[]): Promise<GeminiDetectedItem[]> {
  const { output } = await generateText({
    model: google()(GEMINI_MODEL),
    output: Output.object({ schema: detectionSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "You are cataloging items for a home inventory app. Identify every distinct physical " +
              "item visible across these photo(s). For each item, pick the category from the allowed " +
              "list that fits best, suggest a couple of short lowercase tags if relevant, and give an " +
              "honest confidence score — use a lower score for anything ambiguous, partially obscured, " +
              "or generic-looking rather than guessing.",
          },
          ...photos.map((photo) => ({ type: "file" as const, mediaType: "image" as const, data: photo })),
        ],
      },
    ],
  });

  return output.items;
}
