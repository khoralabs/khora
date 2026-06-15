import { ArrowLeft, Link2, Plus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { copyTextToClipboard } from "@/lib/copy-text";
import { INVITE_LINK_SINGLE_USE_NOTE } from "@/lib/invite-copy";
import {
  fetchSessionDetail,
  formatInterviewStatus,
  formatParticipantLabel,
  formatPhaseLabel,
  formatSessionDate,
  mintSessionInvite,
  type SessionDetail,
  type SessionParticipant,
} from "@/lib/sessions-api";

type SessionDetailViewProps = {
  sessionId: string;
  onBack: () => void;
};

function InterviewStatusBadge({ status }: { status: SessionParticipant["interviewStatus"] }) {
  const variant =
    status === "complete" ? "secondary" : status === "started" ? "default" : "outline";
  return <Badge variant={variant}>{formatInterviewStatus(status)}</Badge>;
}

function DeadlineBadge({ daysToDeadline }: { daysToDeadline: string | null }) {
  if (daysToDeadline === null) return null;
  const urgent = daysToDeadline === "<1 day" || daysToDeadline === "Past due";
  const label =
    daysToDeadline === "Past due"
      ? "Past due"
      : daysToDeadline === "<1 day"
        ? "<1 day left"
        : `${daysToDeadline} left`;
  return <Badge variant={urgent ? "destructive" : "outline"}>{label}</Badge>;
}

export function SessionDetailView({ sessionId, onBack }: SessionDetailViewProps) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addingParticipant, setAddingParticipant] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSessionDetail(sessionId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load session");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handleAddParticipant() {
    setAddingParticipant(true);
    setError(null);
    setCopied(false);
    try {
      const invite = await mintSessionInvite(sessionId);
      setInviteUrl(invite.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite link");
    } finally {
      setAddingParticipant(false);
    }
  }

  async function handleCopyInviteUrl() {
    if (inviteUrl === null) return;
    setError(null);
    try {
      await copyTextToClipboard(inviteUrl);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. Select the link below and copy manually.");
    }
  }

  if (detail === null && error === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft />
          Back to sessions
        </Button>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{detail.session.displayName}</h1>
          <p className="text-sm text-muted-foreground">{detail.session.topic}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{formatPhaseLabel(detail.session.phase)}</Badge>
            <DeadlineBadge daysToDeadline={detail.session.daysToDeadline} />
            <Badge variant="outline">{detail.session.status}</Badge>
          </div>
          <CardDescription>Created {formatSessionDate(detail.session.createdAtMs)}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel>Seed prompt</FieldLabel>
                <FieldDescription className="text-foreground">
                  {detail.session.prompt}
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Participants</CardTitle>
            <CardDescription>
              Individual interview progress for each stakeholder in this session.
            </CardDescription>
          </div>
          {detail.canManage ? (
            <Button
              variant="outline"
              size="sm"
              disabled={addingParticipant}
              onClick={() => void handleAddParticipant()}
            >
              <UserPlus />
              {addingParticipant ? "Creating…" : "Add participant"}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No participants yet.</p>
          ) : (
            detail.participants.map((participant) => (
              <div
                key={participant.userId}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{formatParticipantLabel(participant)}</p>
                  <p className="text-xs text-muted-foreground">
                    {participant.role === "facilitator" ? "Facilitator" : "Participant"}
                  </p>
                </div>
                <InterviewStatusBadge status={participant.interviewStatus} />
              </div>
            ))
          )}

          {inviteUrl !== null && detail.canManage ? (
            <FieldSet>
              <FieldLegend className="sr-only">Latest invite link</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="session-invite-url">Latest invite link</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="session-invite-url"
                      readOnly
                      disabled={copied}
                      value={inviteUrl}
                      className="min-w-0 flex-1"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={addingParticipant}
                      onClick={() => void (copied ? handleAddParticipant() : handleCopyInviteUrl())}
                    >
                      {copied ? (
                        <>
                          <Plus />
                          New link
                        </>
                      ) : (
                        <>
                          <Link2 />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <FieldDescription>
                    Share this link with a stakeholder to add them to the session.{" "}
                    {INVITE_LINK_SINGLE_USE_NOTE}
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </FieldSet>
          ) : null}
        </CardContent>
      </Card>

      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
