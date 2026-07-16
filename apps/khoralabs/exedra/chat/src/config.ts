import path from "node:path";
import { chatInternalToken as requireChatInternalToken } from "@khoralabs/chat-http";

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

/** Map Exedra env aliases onto chat-http's CHAT_* vars. */
export function applyExedraChatEnv(): void {
  if (
    process.env.CHAT_DB_PATH?.trim() === undefined ||
    process.env.CHAT_DB_PATH.trim().length === 0
  ) {
    process.env.CHAT_DB_PATH = resolveExedraChatDbPath();
  }
  if (
    process.env.CHAT_INTERNAL_TOKEN?.trim() === undefined ||
    process.env.CHAT_INTERNAL_TOKEN.trim().length === 0
  ) {
    const legacy = process.env.EXEDRA_INTERNAL_TOKEN?.trim();
    if (legacy !== undefined && legacy.length > 0) {
      process.env.CHAT_INTERNAL_TOKEN = legacy;
    }
  }
}

export function chatInternalToken(): string {
  applyExedraChatEnv();
  try {
    return requireChatInternalToken();
  } catch {
    throw new Error("CHAT_INTERNAL_TOKEN or EXEDRA_INTERNAL_TOKEN must be set");
  }
}
