import type { ChatStatus } from "ai";
import { useEffect, useRef, useState } from "react";

import type { BeliefFlag, ChatMessage, InterviewBootstrap } from "@/lib/interview-api";
import {
  extractBeliefsFromMessages,
  fetchInterview,
  uiMessagesToChatMessages,
} from "@/lib/interview-api";

type UseInterviewBootstrapArgs = {
  sessionId: string;
  onBootstrap: (bootstrap: InterviewBootstrap) => void;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
  onError: (error: string | null) => void;
};

export function useInterviewBootstrap({
  sessionId,
  onBootstrap,
  onBeliefsChange,
  onError,
}: UseInterviewBootstrapArgs) {
  const [bootstrap, setBootstrap] = useState<InterviewBootstrap | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [awaitingOpening, setAwaitingOpening] = useState(false);
  const beliefsRef = useRef<BeliefFlag[]>([]);

  useEffect(() => {
    let cancelled = false;
    setBootstrap(null);
    setMessages([]);
    setStatus("ready");
    setAwaitingOpening(false);
    beliefsRef.current = [];
    onError(null);

    void fetchInterview(sessionId)
      .then((data) => {
        if (cancelled) return;
        const chatMessages = uiMessagesToChatMessages(data.messages);
        const initialBeliefs = extractBeliefsFromMessages(data.messages, data.beliefFeedback ?? []);
        beliefsRef.current = initialBeliefs;
        setBootstrap(data);
        onBootstrap(data);
        setMessages(chatMessages);
        onBeliefsChange(initialBeliefs);
        setAwaitingOpening(chatMessages.length === 0);
        if (chatMessages.length === 0) {
          setStatus("submitted");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        onError(err instanceof Error ? err.message : "Failed to load interview");
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, onBootstrap, onBeliefsChange, onError]);

  return {
    bootstrap,
    messages,
    setMessages,
    status,
    setStatus,
    awaitingOpening,
    setAwaitingOpening,
    beliefsRef,
  };
}
