import type { AgentRegistry } from "@khoralabs/agent-capabilities";
import type { AgentTelemetry } from "@khoralabs/agent-capabilities-otel";
import type {
  InterviewSessionMeta,
  OnboardingInterviewMeta,
  SessionCompletionPayload,
} from "@khoralabs/exedra-interview-agent";
import {
  type InterviewMemoryHit,
  type InterviewMemorySearchOverride,
  type InterviewToolEvent,
  type InterviewTurnOutput,
  runInterviewTurn as runInterviewTurnCore,
  type TurnDocumentAttachment,
} from "@khoralabs/exedra-interview-agent";
import type { LanguageModel, UIMessage } from "ai";
import { createExedraAgentTelemetry } from "../../server/telemetry/agent-telemetry.js";

export type {
  InterviewMemoryHit,
  InterviewMemorySearchOverride,
  InterviewToolEvent,
  InterviewTurnOutput,
  TurnDocumentAttachment,
};

export async function runInterviewTurn(args: {
  registry: AgentRegistry;
  model: LanguageModel;
  sessionId: string;
  sessionMeta: InterviewSessionMeta;
  onboardingMeta?: OnboardingInterviewMeta;
  threadInterviewComplete: boolean;
  orgId: string;
  teamId: string;
  participantUserId: string;
  memoryContext?: string | null;
  memorySearch?: InterviewMemorySearchOverride;
  threadId: string;
  userMessageId: string;
  history: UIMessage[];
  userTimeZone?: string;
  abortSignal?: AbortSignal;
  documentAttachments?: readonly TurnDocumentAttachment[];
  createTelemetry?: () => AgentTelemetry;
  onTextDelta: (delta: string) => void;
  onBeliefFlag: (belief: string, sourceMessageId: string) => void;
  onCompleteSession?: (payload: SessionCompletionPayload) => void;
  onToolEvent?: (event: InterviewToolEvent) => void;
}): Promise<InterviewTurnOutput> {
  return runInterviewTurnCore({
    ...args,
    createTelemetry: args.createTelemetry ?? createExedraAgentTelemetry,
  });
}
