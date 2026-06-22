import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export function resolveFacilitationModel(): LanguageModel {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required");
  }
  const google = createGoogleGenerativeAI({ apiKey });
  return google("gemini-2.5-flash");
}
