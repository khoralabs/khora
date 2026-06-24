import type { Post, PostPage, Thread } from "@khoralabs/chat-core";
import type { AccountProfile } from "@shared/accounts/row";
import type { MessageAuthor } from "@shared/messages/author";

import type { DocumentProcessingStatus } from "@/lib/documents-api";

export type InterviewSession = {
  id: string;
  topic: string;
  status: string;
};

export type BeliefFeedback = "confirmed" | "corrected";

export type BeliefFeedbackRecord = {
  id: string;
  sourceMessageId: string;
  feedback: BeliefFeedback;
  correction?: string;
};

export type BeliefFlag = {
  id: string;
  belief: string;
  sourceMessageId: string;
  feedback?: BeliefFeedback;
  correction?: string;
};

export type InterviewCompletion = {
  completedAtMs: number;
  summary: string;
  nextSessionOptions: string[];
};

export function normalizeNextSessionOptions(value: unknown): string[] {
  if (value == null || !Array.isArray(value)) return [];
  return value
    .filter((option): option is string => typeof option === "string")
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

export function normalizeInterviewCompletion(
  completion: InterviewCompletion | null | undefined,
): InterviewCompletion | null {
  if (completion == null) return null;
  return {
    ...completion,
    nextSessionOptions: normalizeNextSessionOptions(completion.nextSessionOptions),
  };
}

function isSessionCompletionToolName(toolName: string): boolean {
  return toolName === "completeSession" || toolName === "completeOnboardingInterview";
}

export function extractCompletionFromPosts(posts: Post[]): InterviewCompletion | null {
  for (let index = posts.length - 1; index >= 0; index -= 1) {
    const post = posts[index];
    if (post?.role !== "assistant") continue;

    for (const part of post.parts) {
      if (typeof part.type !== "string" || !part.type.startsWith("tool-")) continue;
      const toolName = part.type.slice("tool-".length);
      if (!isSessionCompletionToolName(toolName)) continue;

      const input = (part as { input?: unknown }).input;
      if (input === null || typeof input !== "object") continue;

      const record = input as { summary?: unknown; nextSessionOptions?: unknown };
      const summary = typeof record.summary === "string" ? record.summary.trim() : "";
      if (summary.length === 0) continue;

      return {
        completedAtMs: post.createdAtMs,
        summary,
        nextSessionOptions: normalizeNextSessionOptions(record.nextSessionOptions),
      };
    }
  }

  return null;
}

export type InterviewBootstrap = {
  session: InterviewSession;
  thread: Thread | null;
  posts: PostPage;
  agent: MessageAuthor | null;
  viewer: MessageAuthor | null;
  beliefFeedback?: BeliefFeedbackRecord[];
  completion?: InterviewCompletion;
  canFacilitate?: boolean;
  canParticipate?: boolean;
  canWriteInterview?: boolean;
};

export type FacilitationBootstrap = {
  session: InterviewSession;
  thread: Thread;
  posts: PostPage;
  agent: MessageAuthor | null;
  viewer: MessageAuthor | null;
  canWrite: boolean;
  canFacilitate: boolean;
  canParticipate: boolean;
};

export type ParticipantInterviewView = InterviewBootstrap & {
  readOnly: true;
  participant: AccountProfile;
};

export type ChatDocument = {
  id: string;
  fileName: string;
  mediaType?: string;
  byteSize?: number;
  status?: DocumentProcessingStatus;
  messageId: string;
  createdAtMs: number;
  ownerName?: string;
};

type ChatDocumentSourceMessage = {
  id: string;
  role: string;
  createdAtMs: number;
  author?: { name: string } | null;
  attachments?: Array<{
    id: string;
    fileName: string;
    mediaType?: string;
    byteSize?: number;
    status?: DocumentProcessingStatus;
  }>;
};

export function extractChatDocuments(
  messages: readonly ChatDocumentSourceMessage[],
): ChatDocument[] {
  const documents: ChatDocument[] = [];
  for (const message of messages) {
    if (message.role !== "user" || message.attachments === undefined) continue;
    for (const attachment of message.attachments) {
      documents.push({
        id: attachment.id,
        fileName: attachment.fileName,
        mediaType: attachment.mediaType,
        byteSize: attachment.byteSize,
        status: attachment.status,
        messageId: message.id,
        createdAtMs: message.createdAtMs,
        ownerName: message.author?.name,
      });
    }
  }
  return documents;
}

export function extractBeliefsFromPosts(
  posts: Post[],
  feedbackRecords: readonly BeliefFeedbackRecord[] = [],
): BeliefFlag[] {
  const feedbackById = new Map(feedbackRecords.map((record) => [record.id, record]));
  const beliefs: BeliefFlag[] = [];
  for (const post of posts) {
    const metadata = post.metadata as
      | { beliefFlags?: { belief: string; messageId: string }[] }
      | undefined;
    for (const flag of metadata?.beliefFlags ?? []) {
      const id = `${post.id}:${beliefs.length}`;
      const saved = feedbackById.get(id);
      beliefs.push({
        id,
        belief: flag.belief,
        sourceMessageId: flag.messageId,
        ...(saved?.feedback !== undefined ? { feedback: saved.feedback } : {}),
        ...(saved?.correction !== undefined ? { correction: saved.correction } : {}),
      });
    }
  }
  return beliefs;
}

export function mergeBeliefFeedback(
  beliefs: BeliefFlag[],
  feedbackRecords: readonly BeliefFeedbackRecord[],
): BeliefFlag[] {
  if (feedbackRecords.length === 0) return beliefs;
  const feedbackById = new Map(feedbackRecords.map((record) => [record.id, record]));
  return beliefs.map((belief) => {
    const saved = feedbackById.get(belief.id);
    if (saved === undefined) return belief;
    return {
      ...belief,
      feedback: saved.feedback,
      ...(saved.correction !== undefined ? { correction: saved.correction } : {}),
    };
  });
}

export async function fetchParticipantInterview(
  sessionId: string,
  participantUserId: string,
): Promise<ParticipantInterviewView> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantUserId)}/interview`,
    { credentials: "include" },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to load participant interview");
  }
  const body = (await res.json()) as ParticipantInterviewView;
  return {
    ...body,
    completion:
      normalizeInterviewCompletion(body.completion) ??
      extractCompletionFromPosts(body.posts.items) ??
      undefined,
  };
}

export async function fetchFacilitation(sessionId: string): Promise<FacilitationBootstrap> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/facilitation`, {
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to load facilitation");
  }
  return (await res.json()) as FacilitationBootstrap;
}

export async function optInInterview(sessionId: string): Promise<{ chatThreadId: string }> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/interview/opt-in`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to opt in to interview");
  }
  return (await res.json()) as { chatThreadId: string };
}

export async function fetchInterview(sessionId: string): Promise<InterviewBootstrap> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/interview`, {
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to load interview");
  }
  const body = (await res.json()) as InterviewBootstrap;
  return {
    ...body,
    completion:
      normalizeInterviewCompletion(body.completion) ??
      extractCompletionFromPosts(body.posts.items) ??
      undefined,
  };
}

export async function patchBeliefFeedback(
  sessionId: string,
  beliefId: string,
  body: {
    sourceMessageId: string;
    belief: string;
    feedback: BeliefFeedback;
    correction?: string;
  },
): Promise<BeliefFeedbackRecord> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/interview/beliefs/${encodeURIComponent(beliefId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    let message = `Could not save belief feedback (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }
  const data = JSON.parse(text) as { beliefFeedback: BeliefFeedbackRecord };
  return data.beliefFeedback;
}

export function interviewWsUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}
