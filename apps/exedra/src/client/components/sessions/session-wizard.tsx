import { ArrowLeft, Link2, Plus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { copyTextToClipboard } from "@/lib/copy-text";
import { INVITE_LINK_SINGLE_USE_NOTE } from "@/lib/invite-copy";
import { type MeTeam, mintTeamInvite } from "@/lib/me-api";
import {
  createSession,
  fetchTeamMembers,
  formatMemberLabel,
  type TeamMember,
} from "@/lib/sessions-api";

type SessionWizardProps = {
  team: MeTeam;
  onCancel: () => void;
  onCreated: (sessionId: string) => void;
};

export function SessionWizard({ team, onCancel, onCreated }: SessionWizardProps) {
  const [displayName, setDisplayName] = useState("");
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [teamInviteUrl, setTeamInviteUrl] = useState<string | null>(null);
  const [mintingTeamInvite, setMintingTeamInvite] = useState(false);
  const [teamInviteCopied, setTeamInviteCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTeamMembers(team.id)
      .then((items) => {
        if (cancelled) return;
        setMembers(items.filter((member) => !member.isCurrentUser));
        setLoadingMembers(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load team members");
        setLoadingMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [team.id]);

  function toggleMember(userId: string) {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleAddTeamMember() {
    setMintingTeamInvite(true);
    setError(null);
    setTeamInviteCopied(false);
    try {
      const invite = await mintTeamInvite(team.id);
      setTeamInviteUrl(new URL(invite.url, window.location.origin).href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite link");
    } finally {
      setMintingTeamInvite(false);
    }
  }

  async function handleCopyTeamInvite() {
    if (teamInviteUrl === null) return;
    setError(null);
    try {
      await copyTextToClipboard(teamInviteUrl);
      setTeamInviteCopied(true);
    } catch {
      setError("Could not copy automatically. Select the link below and copy manually.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmedDisplayName = displayName.trim();
    const trimmedTopic = topic.trim();
    const trimmedPrompt = prompt.trim();
    if (
      trimmedDisplayName.length === 0 ||
      trimmedTopic.length === 0 ||
      trimmedPrompt.length === 0
    ) {
      setError("Session name, topic, and prompt are required.");
      return;
    }

    let deadlineMs: number | undefined;
    if (deadline !== undefined) {
      const endOfDay = new Date(deadline);
      endOfDay.setHours(23, 59, 59, 999);
      deadlineMs = endOfDay.getTime();
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await createSession({
        teamId: team.id,
        displayName: trimmedDisplayName,
        topic: trimmedTopic,
        prompt: trimmedPrompt,
        deadlineMs,
        memberUserIds: [...selectedMemberIds],
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel}>
            <ArrowLeft />
          </Button>
          <div>
            <CardTitle>Create session</CardTitle>
            <CardDescription>
              {team.orgName} · {team.name}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-8">
          <FieldSet>
            <FieldLegend>Session details</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="session-display-name">Session name</FieldLabel>
                <Input
                  id="session-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Q2 roadmap alignment"
                  autoFocus
                />
                <FieldDescription>A short label for this session.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="session-topic">Topic</FieldLabel>
                <Input
                  id="session-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Mobile app launch priorities"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="session-prompt">Seed prompt</FieldLabel>
                <Textarea
                  id="session-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="What should stakeholders know before they respond?"
                  rows={4}
                />
                <FieldDescription>
                  Shown to every participant as the starting context for their interview.
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
                <FieldDescription>
                  Natural language works too — e.g. &quot;next Friday&quot;.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Team members</FieldLegend>
            <FieldDescription>
              Choose colleagues from your team to include in this session.
            </FieldDescription>
            {loadingMembers ? (
              <div className="flex justify-center py-8">
                <Spinner className="size-5" />
              </div>
            ) : members.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserPlus />
                  </EmptyMedia>
                  <EmptyTitle>No other team members yet</EmptyTitle>
                  <EmptyDescription>
                    Invite a colleague to join {team.name} so you can include them in this session.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  {teamInviteUrl === null ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={mintingTeamInvite}
                      onClick={() => void handleAddTeamMember()}
                    >
                      {mintingTeamInvite ? "Creating…" : "Add a team member"}
                    </Button>
                  ) : (
                    <div className="flex w-full flex-col gap-2">
                      <div className="flex w-full gap-2">
                        <Input
                          readOnly
                          disabled={teamInviteCopied}
                          value={teamInviteUrl}
                          className="min-w-0 flex-1"
                          onFocus={(event) => event.currentTarget.select()}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={mintingTeamInvite}
                          onClick={() =>
                            void (teamInviteCopied ? handleAddTeamMember() : handleCopyTeamInvite())
                          }
                        >
                          {teamInviteCopied ? (
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
                      <p className="text-xs text-muted-foreground">{INVITE_LINK_SINGLE_USE_NOTE}</p>
                    </div>
                  )}
                </EmptyContent>
              </Empty>
            ) : (
              <FieldGroup data-slot="checkbox-group">
                {members.map((member) => {
                  const checked = selectedMemberIds.has(member.userId);
                  return (
                    <Field key={member.userId} orientation="horizontal">
                      <input
                        id={`member-${member.userId}`}
                        type="checkbox"
                        className="size-4 rounded border border-input"
                        checked={checked}
                        onChange={() => toggleMember(member.userId)}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={`member-${member.userId}`}>
                          {formatMemberLabel(member)}
                        </FieldLabel>
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldGroup>
            )}
          </FieldSet>

          {error !== null ? <FieldError>{error}</FieldError> : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? "Creating…" : "Create session"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
