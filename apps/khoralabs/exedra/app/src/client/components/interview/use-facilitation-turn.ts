import type { MessageAuthor } from "@shared/messages/author";
import { nanoid } from "nanoid";
import { useCallback, useRef, useState } from "react";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { ChatMessage } from "@/lib/interview-api";

import type { InterviewTurnSessionRefs } from "./use-interview-turn";

type UseFacilitationTurnArgs = {
  canWrite: boolean;
  viewerAuthor: MessageAuthor | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setChatError: (error: string | null) => void;
  ensureWebSocketOpen: () => Promise<WebSocket>;
};

export function useFacilitationTurn({
  canWrite,
  viewerAuthor,
  setMessages,
  setChatError,
  ensureWebSocketOpen,
}: UseFacilitationTurnArgs) {
  const [input, setInput] = useState("");

  const submitTurn = useCallback(
    (promptMessage: PromptInputMessage) => {
      if (!canWrite) return;

      const text = promptMessage.text.trim();
      const files = promptMessage.files;
      if (text.length === 0 && files.length === 0) return;
      if (files.length > 0) {
        setChatError("Attachments are not supported in the facilitation thread yet");
        return;
      }

      const turnId = nanoid();
      setInput("");
      setChatError(null);
      setMessages((current) => [
        ...current,
        {
          id: turnId,
          role: "user",
          content: text,
          createdAtMs: Date.now(),
          author: viewerAuthor,
        },
      ]);

      void (async () => {
        try {
          const ws = await ensureWebSocketOpen();
          ws.send(JSON.stringify({ type: "user_message", turnId, text }));
        } catch (err: unknown) {
          setMessages((current) => current.filter((message) => message.id !== turnId));
          setChatError(err instanceof Error ? err.message : "Could not send message");
        }
      })();
    },
    [canWrite, viewerAuthor, setMessages, setChatError, ensureWebSocketOpen],
  );

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  }, []);

  const sendGenerationRef = useRef(0);
  const abortedGenerationRef = useRef<number | null>(null);

  const sessionRefs: InterviewTurnSessionRefs = {
    sendGenerationRef,
    abortedGenerationRef,
    clearPendingDraft: () => {},
    onTurnAborted: () => {},
    onTurnFailed: () => {},
  };

  return {
    input,
    submitTurn,
    stopTurn: () => {},
    handleTextChange,
    sessionRefs,
  };
}
