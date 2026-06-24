import type { BeliefFlag, ChatDocument, InterviewBootstrap } from "@/lib/interview-api";

import type { InterviewScrollTarget } from "./use-scroll-to-message";

export type SessionCompletePayload = {
  summary: string;
  nextSessionOptions?: string[] | null;
  sessionKind?: "onboarding" | "standard";
};

export type InterviewChatProps = {
  sessionId: string;
  onBootstrap: (bootstrap: InterviewBootstrap) => void;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
  onError: (error: string | null) => void;
  onNavigate: (path: string) => void;
  onSessionComplete?: (payload: SessionCompletePayload) => void;
  scrollToTarget?: InterviewScrollTarget | null;
  onScrollToMessageComplete?: () => void;
  canManage?: boolean;
  onShare?: () => void;
  onTopicChange?: (topic: string) => void;
  sessionComplete?: boolean;
  onChatDocumentsChange?: (documents: ChatDocument[]) => void;
};
