import type { UIMessage } from "ai";

export type SessionCompletionPayloadWire = {
  summary: string;
  nextSessionOptions: string[];
};

export type InterviewMemoryContextWire = {
  orgId: string;
  teamId: string;
  sessionId: string;
  participantUserId: string;
  canSearchPersonal: boolean;
};

export type InterviewMemoryHitWire = {
  source: "org" | "personal";
  key: string;
  snippet: string;
};

export type InterviewTurnContextWire = {
  threadId: string;
  turnId: string;
  sessionId: string;
  sessionKind: string;
  sessionTopic: string;
  sessionInterviewComplete: boolean;
  threadInterviewComplete: boolean;
  userId: string;
  orgId: string;
  teamId: string;
  userTimeZone?: string;
  kickoff?: boolean;
  displayText: string;
  sessionMeta: { topic: string };
  onboardingMeta?: { orgName: string; teamName: string };
  history: UIMessage[];
  interviewMemoryContext: InterviewMemoryContextWire;
  documentIds: string[];
};

export type InterviewRagContextRequest = {
  orgId: string;
  teamId: string;
  sessionId: string;
  participantUserId: string;
  userMessageText: string;
  sessionTopic: string;
};

export type InterviewMemorySearchRequest = {
  context: InterviewMemoryContextWire;
  query: string;
  topK?: number;
};

export type AppendInterviewTurnEventsRequest = {
  events: import("./jobs.js").TurnEventWire[];
};

export type CompleteInterviewTurnRequest = {
  assistantId: string;
  assistantParts: UIMessage["parts"];
  beliefFlags: { belief: string; messageId: string }[];
  sessionCompleted: boolean;
  sessionCompletion: SessionCompletionPayloadWire | null;
};

export type FailInterviewTurnRequest = {
  error: string;
};
