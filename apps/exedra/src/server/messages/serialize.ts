import type { Database } from "bun:sqlite";
import type { MessageAuthor } from "@shared/messages/author";
import type { UIMessage } from "ai";

import type { OrgRecord } from "../db/membership";
import type { StoredMessage } from "../db/messages";
import { resolveMessageAuthor } from "./resolve-author";

export type SerializedMessage = {
  id: string;
  role: UIMessage["role"];
  parts: UIMessage["parts"];
  metadata?: UIMessage["metadata"];
  createdAtMs: number;
  author: MessageAuthor | null;
};

export function serializeThreadMessages(
  db: Database,
  messages: StoredMessage[],
  params: {
    org: OrgRecord;
  },
): SerializedMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts,
    createdAtMs: message.createdAtMs,
    author: resolveMessageAuthor(db, {
      authorDid: message.authorDid,
      org: params.org,
    }),
    ...(message.metadata !== undefined ? { metadata: message.metadata } : {}),
  }));
}
