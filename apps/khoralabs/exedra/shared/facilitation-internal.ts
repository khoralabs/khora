import type { UIMessage } from "ai";

export type FacilitationParticipantContextWire = {
  sessionId: string;
  sessionTopic: string;
  participantUserId: string;
  participantName: string;
  threadId: string;
  messages: UIMessage[];
  beliefs: string[];
};

export type AppendFacilitationMessageRequest = {
  assistantId: string;
  parts: UIMessage["parts"];
};
