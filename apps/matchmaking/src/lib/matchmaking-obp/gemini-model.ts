import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export function resolveGeminiApiKey(): string {
  const k =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (!k) {
    throw new Error(
      "Set GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) for LLM negotiation.",
    );
  }
  return k;
}

let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;

export function getNegotiationModel(): LanguageModel {
  if (!google) {
    google = createGoogleGenerativeAI({ apiKey: resolveGeminiApiKey() });
  }
  const id = process.env.OBP_NEGOTIATION_MODEL?.trim() || "gemini-flash-lite-latest";
  return google.languageModel(id);
}
