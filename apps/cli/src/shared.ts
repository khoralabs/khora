import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { MemoriesClient } from "@cfd/memories-core";
import {
  canonicalLabelPropsSearchFormatter,
  canonicalOntology,
} from "@cfd/memories-core-ontologies";
import {
  createMemoriesPersistence,
  openMemoriesDatabase,
} from "@cfd/memories-core-persistence/sqlite";
import { type EmbeddingResolutionPreset, Librarian } from "@cfd/memories-librarian";

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

export type MemoriesCliBundle = {
  db: Database;
  persistence: ReturnType<typeof createMemoriesPersistence>;
  client: MemoriesClient<
    (typeof canonicalOntology)["nodeLabels"],
    (typeof canonicalOntology)["edgeLabels"]
  >;
};

const bundleByDbPath = new Map<string, MemoriesCliBundle>();

/** Singleton per `dbPath`: one open DB, persistence, and {@link MemoriesClient}. */
export function getMemoriesBundle(dbPath: string): MemoriesCliBundle {
  let bundle = bundleByDbPath.get(dbPath);
  if (!bundle) {
    ensureParentDirForDb(dbPath);
    const db = openMemoriesDatabase(dbPath);
    const persistence = createMemoriesPersistence(db, {
      labelPropsSearchFormatter: canonicalLabelPropsSearchFormatter,
    });
    const client = new MemoriesClient(persistence, canonicalOntology);
    bundle = { db, persistence, client };
    bundleByDbPath.set(dbPath, bundle);
  }
  return bundle;
}

type CliLibrarian = Librarian<
  (typeof canonicalOntology)["nodeLabels"],
  (typeof canonicalOntology)["edgeLabels"]
>;

const librarianByDbAndResolution = new Map<string, CliLibrarian>();

function librarianCacheKey(dbPath: string, resolution: EmbeddingResolutionPreset): string {
  return `${dbPath}\0${resolution}`;
}

/**
 * Singleton per `(dbPath, resolution)`: same {@link getMemoriesBundle} client, embedding dims match CLI `-dim`.
 */
export function getLibrarian(dbPath: string, resolution: EmbeddingResolutionPreset): CliLibrarian {
  const key = librarianCacheKey(dbPath, resolution);
  let lib = librarianByDbAndResolution.get(key);
  if (!lib) {
    const { client } = getMemoriesBundle(dbPath);
    const apiKey = resolveGeminiApiKey();
    const google = createGoogleGenerativeAI({ apiKey });
    lib = new Librarian({
      client,
      embedding: {
        model: google.embeddingModel("gemini-embedding-2-preview"),
        resolution,
      },
      multimodal: false,
      agent: {
        model: google.languageModel("gemini-flash-lite-latest"),
      },
    });
    librarianByDbAndResolution.set(key, lib);
  }
  return lib;
}
