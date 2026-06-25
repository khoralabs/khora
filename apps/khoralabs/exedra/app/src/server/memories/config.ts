import { resolveExedraDataDir } from "../db/index";

export function resolveMemoriesDir(): string {
  return `${resolveExedraDataDir()}/memories`;
}

export function getMemoriesSqlCipherKey(): string {
  const raw =
    process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY?.trim() ??
    process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY?.trim();
  if (raw === undefined || raw.length === 0) {
    throw new Error("EXEDRA_KNOWLEDGE_SQLCIPHER_KEY is required for memories databases");
  }
  return raw;
}
