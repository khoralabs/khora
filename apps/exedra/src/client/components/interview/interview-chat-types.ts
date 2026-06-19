import type { MessageAuthor } from "@shared/messages/author";
import type { UIMessage } from "ai";
import type { BeliefFlag, InterviewBootstrap } from "@/lib/interview-api";

export type InterviewChatProps = {
  sessionId: string;
  onBootstrap: (bootstrap: InterviewBootstrap) => void;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
  onError: (error: string | null) => void;
  onNavigate: (path: string) => void;
  onOnboardingComplete?: () => void;
  scrollToMessageId?: string | null;
  onScrollToMessageComplete?: () => void;
  canManage?: boolean;
  onShare?: () => void;
  onTopicChange?: (topic: string) => void;
};

export type WsServerMessage =
  | { type: "ready"; threadId: string }
  | {
      type: "user_message_saved";
      message: {
        id: string;
        role: "user";
        parts: { type: "text"; text: string }[];
        metadata?: {
          kickoff?: boolean;
          documents?: { id: string; fileName: string }[];
        };
      };
      createdAtMs: number;
      author: MessageAuthor | null;
    }
  | { type: "text_delta"; delta: string }
  | {
      type: "assistant_message";
      message: {
        id: string;
        role: "assistant";
        parts: UIMessage["parts"];
        metadata?: { beliefFlags?: { belief: string; messageId: string }[] };
      };
      createdAtMs: number;
      author: MessageAuthor | null;
      onboardingCompleted?: boolean;
    }
  | { type: "tool_call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool_error"; toolCallId: string; toolName: string; errorText: string }
  | { type: "belief_flag"; belief: string; sourceMessageId: string }
  | { type: "turn_aborted"; turnId: string }
  | { type: "onboarding_complete"; summary: string }
  | { type: "error"; error: string }
  | { type: "pong" };
