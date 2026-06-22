import type { FileUIPart } from "ai";
import { FileUp, Upload } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { contributeKnowledge, type DocumentBatch, fetchDocumentBatch } from "@/lib/documents-api";
import { cn } from "@/lib/utils";

type ContributeKnowledgeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  orgId?: string;
  teamId?: string;
  sessionId?: string;
  onContributed?: () => void;
};

type DialogPhase = "idle" | "uploading" | "processing" | "done" | "error";

type PendingFile = FileUIPart & { id: string; file: File };

const MAX_FILES = 10;

function fileToAttachment(file: File): PendingFile {
  const id = nanoid();
  return {
    type: "file",
    id,
    filename: file.name,
    mediaType: file.type || "application/octet-stream",
    url: URL.createObjectURL(file),
    file,
  };
}

function pollBatchUntilSettled(batchId: string): Promise<DocumentBatch> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const batch = await fetchDocumentBatch(batchId);
        if (batch.status === "ready") {
          resolve(batch);
          return;
        }
        if (batch.status === "failed") {
          const failed = batch.documents.find((document) => document.status === "failed");
          reject(new Error(failed?.errorMessage ?? "Processing failed"));
          return;
        }
        setTimeout(poll, 1500);
      } catch (err) {
        reject(err);
      }
    };
    void poll();
  });
}

export function ContributeKnowledgeDialog({
  open,
  onOpenChange,
  namespace,
  orgId,
  teamId,
  sessionId,
  onContributed,
}: ContributeKnowledgeDialogProps) {
  const [attachments, setAttachments] = useState<PendingFile[]>([]);
  const [contextText, setContextText] = useState("");
  const [phase, setPhase] = useState<DialogPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAttachments((current) => {
      for (const attachment of current) {
        if (attachment.url.startsWith("blob:")) URL.revokeObjectURL(attachment.url);
      }
      return [];
    });
    setContextText("");
    setPhase("idle");
    setError(null);
    setDragOver(false);
  }, [open]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;
    setAttachments((current) => {
      const remaining = MAX_FILES - current.length;
      if (remaining <= 0) return current;
      return [...current, ...incoming.slice(0, remaining).map(fileToAttachment)];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const next = current.filter((attachment) => attachment.id !== id);
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.url.startsWith("blob:")) URL.revokeObjectURL(removed.url);
      return next;
    });
  }, []);

  const canSubmit = useMemo(
    () => attachments.length > 0 || contextText.trim().length > 0,
    [attachments.length, contextText],
  );

  async function handleSubmit() {
    setError(null);
    if (!canSubmit) {
      setError("Add at least one file or describe the knowledge you want to contribute.");
      return;
    }

    setPhase("uploading");
    try {
      const batch = await contributeKnowledge({
        files: attachments.map((attachment) => attachment.file),
        contextText: contextText.trim(),
        namespace,
        orgId,
        teamId,
        sessionId,
      });
      setPhase("processing");
      await pollBatchUntilSettled(batch.batchId);
      setPhase("done");
      onContributed?.();
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Contribution failed");
    }
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contribute knowledge</DialogTitle>
          <DialogDescription>
            Drop files, add attachments, and describe how they relate. Everything in one batch is
            integrated together into the current scope.
          </DialogDescription>
        </DialogHeader>

        {phase === "done" ? (
          <p className="text-sm text-muted-foreground">
            Your contribution was processed and added to the knowledge graph.
          </p>
        ) : (
          <div className="space-y-4">
            <label
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30",
                busy && "pointer-events-none opacity-60",
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                if (event.dataTransfer.files.length > 0) {
                  addFiles(event.dataTransfer.files);
                }
              }}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag files here or{" "}
                <span className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline">
                  browse
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    disabled={busy || attachments.length >= MAX_FILES}
                    onChange={(event) => {
                      if (event.target.files !== null) addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </span>
              </p>
              <p className="text-xs text-muted-foreground">Up to {MAX_FILES} files per batch</p>
            </label>

            {attachments.length > 0 ? (
              <Attachments className="w-full" variant="grid">
                {attachments.map((attachment) => (
                  <Attachment
                    data={attachment}
                    key={attachment.id}
                    onRemove={() => removeAttachment(attachment.id)}
                  >
                    <AttachmentPreview />
                    <AttachmentRemove />
                  </Attachment>
                ))}
              </Attachments>
            ) : null}

            <Textarea
              disabled={busy}
              placeholder="Describe how these files relate, or paste knowledge to add on its own..."
              rows={5}
              value={contextText}
              onChange={(event) => setContextText(event.target.value)}
            />
          </div>
        )}

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            {phase === "uploading" ? "Uploading..." : "Processing batch..."}
          </div>
        ) : null}

        {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          {phase === "done" ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || !canSubmit}
                onClick={() => void handleSubmit()}
              >
                {busy ? "Working..." : "Contribute"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ContributeKnowledgeOverlayButtonProps = {
  namespace: string;
  orgId?: string;
  teamId?: string;
  sessionId?: string;
  onContributed?: () => void;
};

export function ContributeKnowledgeOverlayButton({
  namespace,
  orgId,
  teamId,
  sessionId,
  onContributed,
}: ContributeKnowledgeOverlayButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <FileUp />
        Add knowledge
      </Button>
      <ContributeKnowledgeDialog
        open={open}
        onOpenChange={setOpen}
        namespace={namespace}
        orgId={orgId}
        teamId={teamId}
        sessionId={sessionId}
        onContributed={onContributed}
      />
    </>
  );
}
