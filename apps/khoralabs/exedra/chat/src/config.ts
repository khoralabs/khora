import path from "node:path";

export function resolveExedraChatDataDir(): string {
  const raw = process.env.EXEDRA_DATA_DIR?.trim();
  if (raw !== undefined && raw.length > 0) return raw;
  return path.join(process.cwd(), "data");
}

export function resolveExedraChatDbPath(): string {
  const raw = process.env.EXEDRA_CHAT_DB_PATH?.trim();
  if (raw !== undefined && raw.length > 0) return raw;
  return path.join(resolveExedraChatDataDir(), "exedra-chat.db");
}

export function chatInternalToken(): string {
  const value =
    process.env.CHAT_INTERNAL_TOKEN?.trim() ?? process.env.EXEDRA_INTERNAL_TOKEN?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error("CHAT_INTERNAL_TOKEN or EXEDRA_INTERNAL_TOKEN must be set");
  }
  return value;
}
