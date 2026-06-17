import type { ChatStatus } from "ai";
import { nanoid } from "nanoid";
import { type Dispatch, type RefObject, type SetStateAction, useCallback, useState } from "react";

import type { AttachmentData } from "@/components/ai-elements/attachments";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { uploadSessionDocument } from "@/lib/documents-api";
import type { ChatMessage } from "@/lib/interview-api";

type UseInterviewSendMessageArgs = {
  sessionId: string;
  status: ChatStatus;
  setStatus: Dispatch<SetStateAction<ChatStatus>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setChatError: (error: string | null) => void;
  streamingIdRef: RefObject<string | null>;
  ensureWebSocketOpen: () => Promise<WebSocket>;
};

export function useInterviewSendMessage({
  sessionId,
  status,
  setStatus,
  setMessages,
  setChatError,
  streamingIdRef,
  ensureWebSocketOpen,
}: UseInterviewSendMessageArgs) {
  const [input, setInput] = useState("");

  const handleSendMessage = useCallback(
    async (promptMessage: PromptInputMessage) => {
      const text = promptMessage.text.trim();
      const files = promptMessage.files;
      if ((text.length === 0 && files.length === 0) || status !== "ready") return;

      setChatError(null);
      setStatus("submitted");
      setMessages((current) => [
        ...current,
        {
          id: `temp-${nanoid()}`,
          role: "user",
          content: text,
          attachments: files.map((file, index) => ({
            id: (file as AttachmentData).id ?? file.filename ?? `pending-${index}`,
            fileName: file.filename ?? "Attachment",
            mediaType: file.mediaType,
            url: file.url,
          })),
        },
      ]);

      try {
        const ws = await ensureWebSocketOpen();

        const documentIds: string[] = [];
        for (const filePart of files) {
          const blob = await fetch(filePart.url).then((response) => response.blob());
          const file = new File([blob], filePart.filename ?? "upload", {
            type: filePart.mediaType ?? blob.type,
          });
          const uploaded = await uploadSessionDocument(sessionId, file);
          documentIds.push(uploaded.id);
        }

        ws.send(
          JSON.stringify({
            type: "user_message",
            text,
            ...(documentIds.length > 0 ? { documentIds } : {}),
          }),
        );
      } catch (err: unknown) {
        streamingIdRef.current = null;
        setMessages((current) => current.filter((message) => !message.id.startsWith("temp-")));
        setChatError(err instanceof Error ? err.message : "Could not send message");
        setStatus("ready");
      }
    },
    [sessionId, status, setStatus, setMessages, setChatError, streamingIdRef, ensureWebSocketOpen],
  );

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  }, []);

  return { input, handleSendMessage, handleTextChange };
}
