import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** One Gemini key for @ai-sdk/google; .env often uses one name only. */
export function resolveGeminiApiKey(): string {
  const k =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (!k) {
    throw new Error(
      "Set GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) in .env — required for search and remember.",
    );
  }
  return k;
}

/** SQLite creates the DB file but not parent dirs; mkdir so default `./.cfd/...` works. */
export function ensureParentDirForDb(filePath: string): void {
  if (filePath === ":memory:" || filePath.startsWith("file:")) return;
  const dir = dirname(filePath);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
}
