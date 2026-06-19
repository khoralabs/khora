import type { MessageAuthor } from "@shared/messages/author";
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
import type { BeliefFlag, ChatMessage } from "@/lib/interview-api";
import { getBrowserTimeZone } from "@/lib/user-timezone";

type PromptAttachmentControls = {
  add: (files: File[] | FileList) => void;
  clear: () => void;
};

type PendingDraft = {
  text: string;
  files: PromptInputMessage["files"];
};

export type InterviewTurnSessionRefs = {
  sendGenerationRef: RefObject<number>;
  abortedGenerationRef: RefObject<number | null>;
  clearPendingDraft: () => void;
  onTurnAborted: (turnId: string) => void;
};

type UseInterviewTurnArgs = {
  sessionId: string;
  status: ChatStatus;
  viewerAuthor: MessageAuthor | null;
  setStatus: Dispatch<SetStateAction<ChatStatus>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setChatError: (error: string | null) => void;
  streamingIdRef: RefObject<string | null>;
  ensureWebSocketOpen: () => Promise<WebSocket>;
  attachmentControlsRef: RefObject<PromptAttachmentControls | null>;
  beliefsRef: RefObject<BeliefFlag[]>;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
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

function rollbackTurnUi(args: {
  turnId: string;
  streamingIdRef: RefObject<string | null>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  beliefsSnapshot: BeliefFlag[] | null;
  beliefsRef: RefObject<BeliefFlag[]>;
  onBeliefsChange: (beliefs: BeliefFlag[]) => void;
}): void {
  const streamingId = args.streamingIdRef.current;
  args.streamingIdRef.current = null;

  args.setMessages((current) => {
    let next = current.filter((message) => message.id !== args.turnId);
    if (streamingId !== null) {
      next = next.filter((message) => message.id !== streamingId);
    }
    return next;
  });

  if (args.beliefsSnapshot !== null) {
    args.beliefsRef.current = args.beliefsSnapshot;
    args.onBeliefsChange(args.beliefsSnapshot);
  }
}

export function useInterviewTurn({
  sessionId,
  status,
  viewerAuthor,
  setStatus,
  setMessages,
  setChatError,
  streamingIdRef,
  ensureWebSocketOpen,
  attachmentControlsRef,
  beliefsRef,
  onBeliefsChange,
}: UseInterviewTurnArgs) {
  const [input, setInput] = useState("");

  const pendingDraftRef = useRef<PendingDraft | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);
  const serverBoundRef = useRef(false);
  const beliefsSnapshotRef = useRef<BeliefFlag[] | null>(null);
  const sendGenerationRef = useRef(0);
  const abortedGenerationRef = useRef<number | null>(null);

  const clearPendingDraft = useCallback(() => {
    pendingDraftRef.current = null;
    activeTurnIdRef.current = null;
    serverBoundRef.current = false;
    beliefsSnapshotRef.current = null;
  }, []);

  const revertTurn = useCallback(
    (turnId: string, restoreComposer: boolean) => {
      rollbackTurnUi({
        turnId,
        streamingIdRef,
        setMessages,
        beliefsSnapshot: beliefsSnapshotRef.current,
        beliefsRef,
        onBeliefsChange,
      });

      setStatus("ready");
      setChatError(null);

      const draft = pendingDraftRef.current;
      clearPendingDraft();

      if (restoreComposer && draft !== null) {
        void restoreDraftToComposer(draft, setInput, attachmentControlsRef.current);
      }
    },
    [
      attachmentControlsRef,
      beliefsRef,
      clearPendingDraft,
      onBeliefsChange,
      setChatError,
      setMessages,
      setStatus,
      streamingIdRef,
    ],
  );

  const onTurnAborted = useCallback(
    (turnId: string) => {
      if (activeTurnIdRef.current !== turnId) return;
      revertTurn(turnId, true);
    },
    [revertTurn],
  );

  const submitTurn = useCallback(
    (promptMessage: PromptInputMessage) => {
      const text = promptMessage.text.trim();
      const files = promptMessage.files;
      if ((text.length === 0 && files.length === 0) || status !== "ready") return;

      sendGenerationRef.current += 1;
      const generation = sendGenerationRef.current;
      abortedGenerationRef.current = null;

      const turnId = nanoid();
      activeTurnIdRef.current = turnId;
      serverBoundRef.current = false;
      beliefsSnapshotRef.current = [...beliefsRef.current];
      pendingDraftRef.current = { text: promptMessage.text, files: [...files] };

      setInput("");
      setChatError(null);
      setStatus("submitted");
      setMessages((current) => [
        ...current,
        {
          id: turnId,
          role: "user",
          content: text,
          createdAtMs: Date.now(),
          author: viewerAuthor,
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

          serverBoundRef.current = true;
          ws.send(
            JSON.stringify({
              type: "user_message",
              turnId,
              text,
              timeZone: getBrowserTimeZone(),
              ...(documentIds.length > 0 ? { documentIds } : {}),
            }),
          );
        } catch (err: unknown) {
          if (abortedGenerationRef.current === generation) return;

          revertTurn(turnId, true);
          setChatError(err instanceof Error ? err.message : "Could not send message");
        }
      })();
    },
    [
      sessionId,
      status,
      viewerAuthor,
      setStatus,
      setMessages,
      setChatError,
      ensureWebSocketOpen,
      beliefsRef,
      revertTurn,
    ],
  );

  const stopTurn = useCallback(async () => {
    if (status !== "submitted" && status !== "streaming") return;

    const turnId = activeTurnIdRef.current;
    if (turnId === null) return;

    abortedGenerationRef.current = sendGenerationRef.current;

    if (serverBoundRef.current) {
      try {
        const ws = await ensureWebSocketOpen();
        ws.send(JSON.stringify({ type: "abort_turn", turnId }));
      } catch {
        // local rollback still applies
      }
    }

    revertTurn(turnId, true);
  }, [status, ensureWebSocketOpen, revertTurn]);

  const handleTextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  }, []);

  const sessionRefs: InterviewTurnSessionRefs = {
    sendGenerationRef,
    abortedGenerationRef,
    clearPendingDraft,
    onTurnAborted,
  };

  return { input, submitTurn, stopTurn, handleTextChange, sessionRefs };
}

/** @deprecated Use InterviewTurnSessionRefs */
export type InterviewSendGenerationRefs = InterviewTurnSessionRefs;
