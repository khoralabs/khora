import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { isTextLikeMime } from "@khoralabs/memories-core/helpers";
import { generateText } from "ai";

import { resolveGeminiApiKey } from "../memories/embedding.js";

const TEXT_SUMMARY_MAX_CHARS = 12_000;

function truncateForSummary(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= TEXT_SUMMARY_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, TEXT_SUMMARY_MAX_CHARS)}\n\n[truncated]`;
}

function fallbackSummary(params: { fileName: string; mimeType: string; text?: string }): string {
  if (params.text !== undefined && params.text.trim().length > 0) {
    const snippet = params.text.trim().slice(0, 400);
    return `Uploaded document "${params.fileName}" (${params.mimeType}). Content preview: ${snippet}`;
  }
  return `Uploaded document "${params.fileName}" (${params.mimeType}).`;
}

export async function summarizeDocument(params: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<string> {
  const apiKey = resolveGeminiApiKey();
  const mimeType = params.mimeType.trim() || "application/octet-stream";

  if (isTextLikeMime(mimeType)) {
    const text = new TextDecoder().decode(params.bytes);
    const body = truncateForSummary(text);
    if (apiKey === undefined) {
      return fallbackSummary({ fileName: params.fileName, mimeType, text: body });
    }

    const google = createGoogleGenerativeAI({ apiKey });
    const result = await generateText({
      model: google("gemini-flash-latest"),
      prompt: `Summarize this uploaded document in 2-4 concise sentences for an interview assistant. File name: ${params.fileName}\n\n${body}`,
    });
    return (
      result.text.trim() || fallbackSummary({ fileName: params.fileName, mimeType, text: body })
    );
  }

  if (apiKey === undefined) {
    return fallbackSummary({ fileName: params.fileName, mimeType });
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const result = await generateText({
    model: google("gemini-flash-latest"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Summarize this uploaded document in 2-4 concise sentences for an interview assistant. File name: ${params.fileName}`,
          },
          {
            type: "file",
            data: params.bytes,
            mediaType: mimeType,
          },
        ],
      },
    ],
  });

  return result.text.trim() || fallbackSummary({ fileName: params.fileName, mimeType });
}
