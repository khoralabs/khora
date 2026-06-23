import type { ChatStatus } from "ai";
import { useCallback, useEffect, useState } from "react";

import type { ChatMessage, FacilitationBootstrap } from "@/lib/interview-api";
import { fetchFacilitation, uiMessagesToChatMessages } from "@/lib/interview-api";

type UseFacilitationBootstrapArgs = {
  sessionId: string;
  enabled: boolean;
  onError: (error: string | null) => void;
};

export function useFacilitationBootstrap({
  sessionId,
  enabled,
  onError,
}: UseFacilitationBootstrapArgs) {
  const [bootstrap, setBootstrap] = useState<FacilitationBootstrap | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status] = useState<ChatStatus>("ready");

  useEffect(() => {
    if (!enabled) {
      setBootstrap(null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    setBootstrap(null);
    setMessages([]);
    onError(null);

    void fetchFacilitation(sessionId)
      .then((data) => {
        if (cancelled) return;
        setBootstrap(data);
        setMessages(uiMessagesToChatMessages(data.messages));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        onError(err instanceof Error ? err.message : "Failed to load facilitation");
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, sessionId, onError]);

  const resyncFromServer = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await fetchFacilitation(sessionId);
      setBootstrap(data);
      setMessages(uiMessagesToChatMessages(data.messages));
    } catch {
      // Keep existing UI if resync fails.
    }
  }, [enabled, sessionId]);

  return {
    bootstrap,
    messages,
    setMessages,
    status,
    resyncFromServer,
  };
}
