import type { MessageAuthor } from "@shared/messages/author";

import type { InterviewSession, SerializedMessage } from "@/lib/interview-api";

export type ThreadKind = "interview" | "facilitation";

export type ThreadBootstrap = {
  session: InterviewSession;
  threadId: string | null;
  wsUrl?: string;
  messages: SerializedMessage[];
  agent: MessageAuthor | null;
  viewer: MessageAuthor | null;
  canWrite: boolean;
};
