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

export async function extractDocumentText(params: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<string> {
  const mimeType = params.mimeType.trim() || "application/octet-stream";

  if (isTextLikeMime(mimeType)) {
    return new TextDecoder().decode(params.bytes).slice(0, CHUNK_MAX_CHARS);
  }

  const apiKey = resolveGeminiApiKey();
  const fallback = `Uploaded document "${params.fileName}" (${mimeType}).`;
  if (apiKey === undefined) return fallback;

  const google = createGoogleGenerativeAI({ apiKey });
  const blob = new Blob([new Uint8Array(params.bytes)], { type: mimeType });

  try {
    const result = await generateText({
      model: google("gemini-flash-latest"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract the main textual content from this document for knowledge integration. File name: ${params.fileName}. Return plain text only.`,
            },
            { type: "file", data: blob, mediaType: mimeType },
          ],
        },
      ],
    });
    return result.text.trim() || fallback;
  } catch {
    return fallback;
  }
}
