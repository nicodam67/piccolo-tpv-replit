"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";

const LOCALES = ["en", "fr", "de", "ca", "es", "it", "nl", "ro"] as const;
const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  de: "German",
  ca: "Catalan",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  ro: "Romanian",
};

type TranslationMap = Record<string, { name?: string; description?: string }>;

export const autoTranslate = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    locales: v.optional(v.array(v.string())), // if provided, only translate these locales
  },
  handler: async (_ctx, args): Promise<TranslationMap> => {
    // Uses standard OpenAI API. Set OPENAI_API_KEY in Convex environment variables
    // (Convex dashboard → Settings → Environment Variables).
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not configured. Set it in the Convex dashboard under Settings → Environment Variables.",
      );
    }

    const openai = new OpenAI({ apiKey });

    const targetLocales = (args.locales && args.locales.length > 0)
      ? LOCALES.filter((l) => (args.locales as string[]).includes(l))
      : LOCALES;

    if (targetLocales.length === 0) return {};

    const localeList = targetLocales.map((l) => `${l} (${LOCALE_NAMES[l]})`).join(", ");
    const descPart = args.description ? `\nDescription: ${args.description}` : "";

    const prompt = `You are a professional menu translator. Translate the following restaurant menu item into these languages: ${localeList}.

Name: ${args.name}${descPart}

Return a JSON object with a key for each language code. Each value should have "name" and optionally "description" (only if a description was provided). Keep dish names natural and appetizing in each language. Do not add explanations.

Example format:
{
  "fr": { "name": "...", "description": "..." },
  "de": { "name": "...", "description": "..." },
  ...
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as TranslationMap;

    // Validate and filter to only requested locales
    const result: TranslationMap = {};
    for (const locale of targetLocales) {
      const entry = parsed[locale];
      if (entry && typeof entry === "object") {
        result[locale] = {
          name: typeof entry.name === "string" ? entry.name : undefined,
          description: typeof entry.description === "string" ? entry.description : undefined,
        };
      }
    }
    return result;
  },
});
