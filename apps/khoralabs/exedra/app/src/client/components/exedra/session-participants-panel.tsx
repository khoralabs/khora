import { Link2, Plus, UserPlus } from "lucide-react";
import { useState } from "react";

import {
  AccountItem,
  AccountItemActions,
  AccountItemContent,
  AccountItemDescription,
  AccountItemMedia,
  AccountItemTitle,
} from "@/components/account/account-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ItemGroup } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { copyTextToClipboard } from "@/lib/copy-text";
import { INVITE_LINK_SINGLE_USE_NOTE } from "@/lib/invite-copy";
import {
  formatInterviewStatus,
  formatPhaseLabel,
  formatSessionDate,
  type InterviewStatus,
  manageSessionScopes,
  mintSessionInvite,
  type SessionDetail,
  type SessionParticipantRow,
} from "@/lib/sessions-api";

function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  const variant =
    status === "complete" ? "secondary" : status === "started" ? "default" : "outline";
  return <Badge variant={variant}>{formatInterviewStatus(status)}</Badge>;
}

type SessionParticipantsPanelProps = {
  detail: SessionDetail | null;
  sessionId: string;
  onRefresh: () => void;
};

export function SessionParticipantsPanel({
  detail,
  sessionId,
  onRefresh,
}: SessionParticipantsPanelProps) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAddParticipant() {
    setAddingParticipant(true);
    setError(null);
    setCopied(false);
    try {
      const invite = await mintSessionInvite(sessionId);
      setInviteUrl(invite.url);
      onRefresh();
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

  async function handleRemoveParticipant(userId: string) {
    setRemovingUserId(userId);
    setError(null);
    try {
      await manageSessionScopes(sessionId, { remove: { accountIds: [userId] } });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove participant");
    } finally {
      setRemovingUserId(null);
    }
  }

  if (detail === null) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-4" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{formatPhaseLabel(detail.session.phase)}</Badge>
        {detail.session.daysToDeadline !== null ? (
          <Badge variant="outline">{detail.session.daysToDeadline}</Badge>
        ) : null}
        <Badge variant="outline">{detail.session.status}</Badge>
      </div>

      <div className="space-y-3 rounded-lg border bg-background p-4 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Session topic
          </p>
          <p className="mt-1">{detail.session.topic}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Created {formatSessionDate(detail.session.createdAtMs)}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Participants</p>
          {detail.canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={addingParticipant}
              onClick={() => void handleAddParticipant()}
            >
              <UserPlus />
              {addingParticipant ? "Creating…" : "Add"}
            </Button>
          ) : null}
        </div>

        {detail.participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No participants yet.</p>
        ) : (
          <ItemGroup className="gap-2">
            {detail.participants.map((participant: SessionParticipantRow) => (
              <AccountItem
                key={participant.account.userId}
                account={participant.account}
                isCurrentUser={participant.isCurrentUser}
                variant="outline"
                size="sm"
              >
                <AccountItemMedia />
                <AccountItemContent>
                  <AccountItemTitle />
                  <AccountItemDescription>
                    {participant.context.role === "facilitator" ? "Facilitator" : "Participant"}
                  </AccountItemDescription>
                </AccountItemContent>
                <AccountItemActions>
                  <InterviewStatusBadge status={participant.context.interviewStatus} />
                  {detail.canManage &&
                  participant.context.role !== "facilitator" &&
                  !participant.isCurrentUser ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={removingUserId === participant.account.userId}
                      onClick={() => void handleRemoveParticipant(participant.account.userId)}
                    >
                      {removingUserId === participant.account.userId ? "Removing…" : "Remove"}
                    </Button>
                  ) : null}
                </AccountItemActions>
              </AccountItem>
            ))}
          </ItemGroup>
        )}

        {inviteUrl !== null && detail.canManage ? (
          <FieldSet>
            <FieldLegend className="sr-only">Latest invite link</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="session-invite-url">Invite link</FieldLabel>
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
      </div>

      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
