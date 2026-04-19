import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { MemoriesClient } from "@cfd/memories-core";
import {
  createMemoriesEmbeddingModel,
  type EmbeddingModel,
  type EmbeddingResolutionPreset,
  mergeResolutionAndProviderOptions,
} from "@cfd/memories-core/helpers";
import {
  canonicalLabelPropsSearchFormatter,
  canonicalOntology,
} from "@cfd/memories-core-ontologies";
import { createMemoriesPersistence, openMemoriesDatabase } from "@cfd/memories-sqlite";
import type { LanguageModel } from "ai";

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

/** Singleton Google Generative AI client for CLI chat + embedding model IDs. */
let cliGoogle: ReturnType<typeof createGoogleGenerativeAI> | undefined;

export function getCliGoogle(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!cliGoogle) {
    cliGoogle = createGoogleGenerativeAI({ apiKey: resolveGeminiApiKey() });
  }
  return cliGoogle;
}

/** Default chat model for adapter / integrator CLI runs. */
export function getCliChatModel(): LanguageModel {
  return getCliGoogle().languageModel("gemini-flash-lite-latest");
}

const embeddingModelByDbAndResolution = new Map<string, EmbeddingModel>();

function embeddingModelCacheKey(dbPath: string, resolution: EmbeddingResolutionPreset): string {
  return `${dbPath}\0${resolution}`;
}

/**
 * Singleton {@link EmbeddingModel} per `(dbPath, resolution)` — shared by search, adapter, and integrator.
 */
export function getCliEmbeddingModel(
  dbPath: string,
  resolution: EmbeddingResolutionPreset,
): EmbeddingModel {
  const key = embeddingModelCacheKey(dbPath, resolution);
  let m = embeddingModelByDbAndResolution.get(key);
  if (!m) {
    m = createMemoriesEmbeddingModel({
      model: getCliGoogle().embeddingModel("gemini-embedding-2-preview"),
      providerOptions: mergeResolutionAndProviderOptions(resolution),
    });
    embeddingModelByDbAndResolution.set(key, m);
  }
  return m;
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

export type { EmbeddingResolutionPreset };
