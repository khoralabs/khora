import type { ChatStatus } from "ai";
import { nanoid } from "nanoid";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";

import type { AttachmentData } from "@/components/ai-elements/attachments";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { uploadSessionDocument } from "@/lib/documents-api";
import type { ChatMessage } from "@/lib/interview-api";
import { getBrowserTimeZone } from "@/lib/user-timezone";

type PromptAttachmentControls = {
  add: (files: File[] | FileList) => void;
  clear: () => void;
};

type PendingDraft = {
  text: string;
  files: PromptInputMessage["files"];
};

export type InterviewSendGenerationRefs = {
  sendGenerationRef: RefObject<number>;
  abortedGenerationRef: RefObject<number | null>;
  clearPendingDraft: () => void;
};

type UseInterviewSendMessageArgs = {
  sessionId: string;
  status: ChatStatus;
  setStatus: Dispatch<SetStateAction<ChatStatus>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setChatError: (error: string | null) => void;
  streamingIdRef: RefObject<string | null>;
  ensureWebSocketOpen: () => Promise<WebSocket>;
  attachmentControlsRef: RefObject<PromptAttachmentControls | null>;
};

async function restoreDraftToComposer(
  draft: PendingDraft,
  setInput: (value: string) => void,
  controls: PromptAttachmentControls | null,
): Promise<void> {
  setInput(draft.text);
  controls?.clear();
  if (draft.files.length === 0 || controls === null) return;

  const files = await Promise.all(
    draft.files.map(async (filePart) => {
      const blob = await fetch(filePart.url).then((response) => response.blob());
      return new File([blob], filePart.filename ?? "upload", {
        type: filePart.mediaType ?? blob.type,
      });
    }),
  );
  controls.add(files);
}

export function useInterviewSendMessage({
  sessionId,
  status,
  setStatus,
  setMessages,
  setChatError,
  streamingIdRef,
  ensureWebSocketOpen,
  attachmentControlsRef,
}: UseInterviewSendMessageArgs) {
  const [input, setInput] = useState("");

  const pendingDraftRef = useRef<PendingDraft | null>(null);
  const sendGenerationRef = useRef(0);
  const abortedGenerationRef = useRef<number | null>(null);

  const clearPendingDraft = useCallback(() => {
    pendingDraftRef.current = null;
  }, []);

  const handleSendMessage = useCallback(
    (promptMessage: PromptInputMessage) => {
      const text = promptMessage.text.trim();
      const files = promptMessage.files;
      if ((text.length === 0 && files.length === 0) || status !== "ready") return;

      sendGenerationRef.current += 1;
      const generation = sendGenerationRef.current;
      abortedGenerationRef.current = null;

      const tempId = `temp-${nanoid()}`;
      pendingDraftRef.current = { text: promptMessage.text, files: [...files] };

      setInput("");
      setChatError(null);
      setStatus("submitted");
      setMessages((current) => [
        ...current,
        {
          id: tempId,
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

      void (async () => {
        try {
          const ws = await ensureWebSocketOpen();
          if (abortedGenerationRef.current === generation) return;

          const documentIds: string[] = [];
          for (const filePart of files) {
            const blob = await fetch(filePart.url).then((response) => response.blob());
            const file = new File([blob], filePart.filename ?? "upload", {
              type: filePart.mediaType ?? blob.type,
            });
            const uploaded = await uploadSessionDocument(sessionId, file);
            documentIds.push(uploaded.id);
          }

          if (abortedGenerationRef.current === generation) return;

          ws.send(
            JSON.stringify({
              type: "user_message",
              text,
              timeZone: getBrowserTimeZone(),
              ...(documentIds.length > 0 ? { documentIds } : {}),
            }),
          );
        } catch (err: unknown) {
          if (abortedGenerationRef.current === generation) return;

          streamingIdRef.current = null;
          setMessages((current) => current.filter((message) => !message.id.startsWith("temp-")));
          setChatError(err instanceof Error ? err.message : "Could not send message");
          setStatus("ready");

          const draft = pendingDraftRef.current;
          pendingDraftRef.current = null;
          if (draft !== null) {
            await restoreDraftToComposer(draft, setInput, attachmentControlsRef.current);
          }
        }
      })();
    },
    [
      sessionId,
      status,
      setStatus,
      setMessages,
      setChatError,
      streamingIdRef,
      ensureWebSocketOpen,
      attachmentControlsRef,
    ],
  );

  const handleStop = useCallback(() => {
    if (status !== "submitted" && status !== "streaming") return;

    const draft = pendingDraftRef.current;
    if (draft === null) return;

    abortedGenerationRef.current = sendGenerationRef.current;
    const streamingId = streamingIdRef.current;
    streamingIdRef.current = null;

    setMessages((current) => {
      let next = current.filter((message) => !message.id.startsWith("temp-"));
      if (streamingId !== null) {
        next = next.filter((message) => message.id !== streamingId);
      }
      return next;
    });

    setStatus("ready");
    setChatError(null);
    pendingDraftRef.current = null;

    void restoreDraftToComposer(draft, setInput, attachmentControlsRef.current);
  }, [status, setMessages, setStatus, setChatError, streamingIdRef, attachmentControlsRef]);

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  }, []);

  const generationRefs: InterviewSendGenerationRefs = {
    sendGenerationRef,
    abortedGenerationRef,
    clearPendingDraft,
  };

  return { input, handleSendMessage, handleStop, handleTextChange, generationRefs };
}
