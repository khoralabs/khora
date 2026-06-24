import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { StagedFileDropZone } from "@/components/exedra/staged-file-drop-zone";
import { ShareSessionContent } from "@/components/sessions/share-session-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAnalytics } from "@/lib/analytics";
import { contributeKnowledge } from "@/lib/documents-api";
import type { MeTeam } from "@/lib/me-api";
import { orgSessionNamespace } from "@/lib/memories-api";
import { createSession } from "@/lib/sessions-api";
import { type PendingFile, revokeStagedAttachments } from "@/lib/staged-file-attachments";

type SessionWizardProps = {
  team: MeTeam;
  onCancel: () => void;
  onCreated: (sessionId: string) => void;
};

type WizardStep = 1 | 2 | 3;
type PreparePhase = "idle" | "creating" | "contributing";

export function SessionWizard({ team, onCancel, onCreated }: SessionWizardProps) {
  const track = useAnalytics();
  const [step, setStep] = useState<WizardStep>(1);
  const [topic, setTopic] = useState("");
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [preparingShare, setPreparingShare] = useState(false);
  const [preparePhase, setPreparePhase] = useState<PreparePhase>("idle");
  const [stagedDocuments, setStagedDocuments] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stagedDocumentsRef = useRef(stagedDocuments);
  stagedDocumentsRef.current = stagedDocuments;

  useEffect(() => {
    return () => {
      revokeStagedAttachments(stagedDocumentsRef.current);
    };
  }, []);

  function handleBack() {
    if (step === 1) {
      onCancel();
      return;
    }
    setError(null);
    setStep((current) => (current === 3 ? 2 : 1));
  }

  function handleNextFromDetails() {
    const trimmedTopic = topic.trim();
    if (trimmedTopic.length === 0) {
      setError("Session topic is required.");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function handleNextFromContext() {
    if (createdSessionId !== null) {
      setError(null);
      setStep(3);
      return;
    }

    const trimmedTopic = topic.trim();
    if (trimmedTopic.length === 0) {
      setError("Session topic is required.");
      setStep(1);
      return;
    }

    let deadlineMs: number | undefined;
    if (deadline !== undefined) {
      const endOfDay = new Date(deadline);
      endOfDay.setHours(23, 59, 59, 999);
      deadlineMs = endOfDay.getTime();
    }

    setPreparingShare(true);
    setPreparePhase("creating");
    setError(null);
    try {
      const result = await createSession({
        teamId: team.id,
        topic: trimmedTopic,
        deadlineMs,
      });

      if (stagedDocuments.length > 0) {
        setPreparePhase("contributing");
        await contributeKnowledge({
          files: stagedDocuments.map((attachment) => attachment.file),
          namespace: orgSessionNamespace(team.orgId, team.id, result.session.id),
          orgId: team.orgId,
          teamId: team.id,
          sessionId: result.session.id,
        });
      }

      track("session_created", { documentCount: stagedDocuments.length });
      setCreatedSessionId(result.session.id);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setPreparingShare(false);
      setPreparePhase("idle");
    }
  }

  function handleFinish() {
    if (createdSessionId === null) return;
    revokeStagedAttachments(stagedDocuments);
    setStagedDocuments([]);
    onCreated(createdSessionId);
  }

  const contextNextLabel =
    preparePhase === "contributing" ? "Adding documents…" : preparingShare ? "Creating…" : "Next";

  return (
    <Card className="mx-auto w-full max-w-2xl border-none shadow-none">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon-sm" onClick={handleBack}>
            <ArrowLeft />
          </Button>
          <div>
            <CardTitle>Create session</CardTitle>
            <CardDescription>
              {team.orgName} · {team.name} · Step {step} of 3
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {step === 1 ? (
          <div className="space-y-8">
            <FieldSet>
              <FieldLegend>Session details</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="session-topic">Topic</FieldLabel>
                  <Input
                    id="session-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Q2 roadmap alignment"
                    autoFocus
                  />
                  <FieldDescription>
                    The interview agent opens with a question about this topic.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="session-deadline">Deadline (optional)</FieldLabel>
                  <DatePicker
                    id="session-deadline"
                    value={deadline}
                    onChange={setDeadline}
                    placeholder="Select a deadline"
                  />
                </Field>
              </FieldGroup>
            </FieldSet>

            {error !== null ? <FieldError>{error}</FieldError> : null}

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" className="flex-1" onClick={handleNextFromDetails}>
                Next
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-8">
            <FieldSet>
              <FieldLegend>Session context (optional)</FieldLegend>
              <FieldDescription>
                Add documents the interview agent can reference during this session, or skip this
                step.
              </FieldDescription>
              <StagedFileDropZone
                attachments={stagedDocuments}
                disabled={preparingShare}
                onAttachmentsChange={setStagedDocuments}
              />
            </FieldSet>

            {error !== null ? <FieldError>{error}</FieldError> : null}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={preparingShare}
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={preparingShare}
                onClick={() => void handleNextFromContext()}
              >
                {contextNextLabel}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 && createdSessionId !== null ? (
          <div className="space-y-8">
            <FieldSet>
              <FieldLegend>Share session</FieldLegend>
              <FieldDescription>
                Choose who can access this session. You will be the facilitator.
              </FieldDescription>
              <ShareSessionContent sessionId={createdSessionId} />
            </FieldSet>

            {error !== null ? <FieldError>{error}</FieldError> : null}

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button type="button" className="flex-1" onClick={handleFinish}>
                Open session
              </Button>
            </div>
          </div>
        ) : step === 3 ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-5" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
