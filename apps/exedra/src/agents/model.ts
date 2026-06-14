import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { getAiApiKey, getAiBaseUrl, getAiModel } from "../server/env";

export function createModel(): LanguageModel {
  const apiKey = getAiApiKey();
  if (apiKey === undefined) {
    throw new Error("AI_API_KEY is not configured");
  }
  const baseURL = getAiBaseUrl();
  const openai = createOpenAI({
    apiKey,
    ...(baseURL !== undefined ? { baseURL } : {}),
  });
  return openai(getAiModel());
}
