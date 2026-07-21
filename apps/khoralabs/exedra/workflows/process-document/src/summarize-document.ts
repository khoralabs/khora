import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { isTextLikeMime } from "@khoralabs/memories-node/helpers";
import { generateText } from "ai";

const CHUNK_MAX_CHARS = 12_000;

function resolveGeminiApiKey(): string | undefined {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim()
  );
}

export async function summarizeDocumentBytes(params: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<string> {
  const apiKey = resolveGeminiApiKey();
  const mimeType = params.mimeType.trim() || "application/octet-stream";
  const fallback = `Uploaded document "${params.fileName}" (${mimeType}).`;

  if (apiKey === undefined) return fallback;

  const google = createGoogleGenerativeAI({ apiKey });

  if (isTextLikeMime(mimeType)) {
    const text = new TextDecoder().decode(params.bytes).slice(0, CHUNK_MAX_CHARS);
    const result = await generateText({
      model: google("gemini-flash-latest"),
      prompt: `Summarize this uploaded document in 2-4 concise sentences for an interview assistant. File name: ${params.fileName}\n\n${text}`,
    });
    return result.text.trim() || fallback;
  }

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
          { type: "file", data: params.bytes, mediaType: mimeType },
        ],
      },
    ],
  });
  return result.text.trim() || fallback;
}
