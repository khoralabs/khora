import path from "node:path";

export function resolveExedraDataDir(): string {
  const raw = process.env.EXEDRA_DATA_DIR?.trim();
  if (raw !== undefined && raw.length > 0) return raw;
  return path.join(process.cwd(), "data");
}

export function resolveKnowledgeDataDir(): string {
  const raw = process.env.EXEDRA_KNOWLEDGE_DATA_DIR?.trim();
  if (raw !== undefined && raw.length > 0) return raw;
  return path.join(resolveExedraDataDir(), "knowledge");
}

export function resolveKnowledgeSqlCipherKey(): string {
  const fromKnowledge = process.env.EXEDRA_KNOWLEDGE_SQLCIPHER_KEY?.trim();
  if (fromKnowledge !== undefined && fromKnowledge.length > 0) return fromKnowledge;
  const legacy = process.env.EXEDRA_MEMORIES_SQLCIPHER_KEY?.trim();
  if (legacy !== undefined && legacy.length > 0) return legacy;
  throw new Error("EXEDRA_KNOWLEDGE_SQLCIPHER_KEY is required");
}

export function resolveKnowledgePort(): number {
  return Number(process.env.PORT?.trim() || "3003");
}
