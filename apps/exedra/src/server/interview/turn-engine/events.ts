import type { MessageAuthor } from "@shared/messages/author";
import type { UIMessage } from "ai";

import type { SessionKind } from "../../db/sessions";

export type SessionCompletionEvent = {
  summary: string;
  nextSessionOptions: string[];
  sessionKind: SessionKind;
};

export type TurnEvent =
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
  | { type: "tool_call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool_error"; toolCallId: string; toolName: string; errorText: string }
  | { type: "belief_flag"; belief: string; sourceMessageId: string }
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
      sessionCompleted?: boolean;
    }
  | { type: "turn_aborted"; turnId: string }
  | { type: "session_complete"; completion: SessionCompletionEvent }
  | { type: "error"; error: string };

export type TurnEmitter = (event: TurnEvent) => void;
