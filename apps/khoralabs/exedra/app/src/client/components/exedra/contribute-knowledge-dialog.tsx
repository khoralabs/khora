import { FileUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { type PendingFile, revokeStagedAttachments } from "@/lib/staged-file-attachments";
import { StagedFileDropZone } from "./staged-file-drop-zone";

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
  useEffect(() => {
    if (!open) return;
    setAttachments((current) => {
      revokeStagedAttachments(current);
      return [];
    });
    setContextText("");
    setPhase("idle");
    setError(null);
  }, [open]);

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
            Add files and text to contribute to the knowledge graph.
          </DialogDescription>
        </DialogHeader>

        {phase === "done" ? (
          <p className="text-sm text-muted-foreground">
            Your contribution was processed and added to the knowledge graph.
          </p>
        ) : (
          <div className="space-y-4">
            <StagedFileDropZone
              attachments={attachments}
              disabled={busy}
              description="Add files and text to contribute to the knowledge graph."
              onAttachmentsChange={setAttachments}
            />

            <Textarea
              disabled={busy}
              placeholder="Share anything..."
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
  canContribute?: boolean;
};

export function ContributeKnowledgeOverlayButton({
  namespace,
  orgId,
  teamId,
  sessionId,
  onContributed,
  canContribute = true,
}: ContributeKnowledgeOverlayButtonProps) {
  const [open, setOpen] = useState(false);

  if (!canContribute) return null;

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
