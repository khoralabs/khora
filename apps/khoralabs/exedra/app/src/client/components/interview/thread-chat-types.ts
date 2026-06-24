import type { PostPage, Thread } from "@khoralabs/chat-core";
import type { MessageAuthor } from "@shared/messages/author";

import type { InterviewSession } from "@/lib/interview-api";

export type ThreadKind = "interview" | "facilitation";

export type ThreadBootstrap = {
  session: InterviewSession;
  thread: Thread | null;
  posts: PostPage;
  agent: MessageAuthor | null;
  viewer: MessageAuthor | null;
  canWrite: boolean;
};
