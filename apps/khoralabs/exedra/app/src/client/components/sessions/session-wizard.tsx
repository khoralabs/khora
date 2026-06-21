import { ArrowLeft, Link2, Plus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AccountItem,
  AccountItemContent,
  AccountItemMedia,
  AccountItemTitle,
} from "@/components/account/account-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAnalytics } from "@/lib/analytics";
import { copyTextToClipboard } from "@/lib/copy-text";
import { INVITE_LINK_SINGLE_USE_NOTE } from "@/lib/invite-copy";
import { type MeTeam, mintTeamInvite } from "@/lib/me-api";
import { createSession, fetchTeamMembers, type TeamMemberRow } from "@/lib/sessions-api";

type SessionWizardProps = {
  team: MeTeam;
  onCancel: () => void;
  onCreated: (sessionId: string) => void;
};

type WizardStep = 1 | 2;

export function SessionWizard({ team, onCancel, onCreated }: SessionWizardProps) {
  const track = useAnalytics();
  const [step, setStep] = useState<WizardStep>(1);
  const [topic, setTopic] = useState("");
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [shareWholeTeam, setShareWholeTeam] = useState(true);
  const [createInvite, setCreateInvite] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [teamInviteUrl, setTeamInviteUrl] = useState<string | null>(null);
  const [mintingTeamInvite, setMintingTeamInvite] = useState(false);
  const [teamInviteCopied, setTeamInviteCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 2 || membersLoaded) return;

    let cancelled = false;
    setLoadingMembers(true);
    void fetchTeamMembers(team.id)
      .then((items) => {
        if (cancelled) return;
        setMembers(items.filter((member) => !member.isCurrentUser));
        setMembersLoaded(true);
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
  }, [step, team.id, membersLoaded]);

  function handleBack() {
    if (step === 1) {
      onCancel();
      return;
    }
    setError(null);
    setStep(1);
  }

  function handleNext() {
    const trimmedTopic = topic.trim();
    if (trimmedTopic.length === 0) {
      setError("Session topic is required.");
      return;
    }
    setError(null);
    setStep(2);
  }

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
      track("invite_link_copied", { source: "session_wizard" });
    } catch {
      setError("Could not copy automatically. Select the link below and copy manually.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

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

    setSubmitting(true);
    setError(null);
    try {
      const result = await createSession({
        teamId: team.id,
        topic: trimmedTopic,
        deadlineMs,
        memberUserIds: [...selectedMemberIds],
        teamIds: shareWholeTeam ? [team.id] : undefined,
        createInvite,
      });
      if (result.inviteUrl !== undefined) {
        try {
          await copyTextToClipboard(result.inviteUrl);
          track("invite_link_copied", { source: "session_wizard" });
        } catch {
          // session was created; invite copy is best-effort
        }
      }
      track("session_created", {
        hasInviteLink: createInvite,
        hasTeamAccess: shareWholeTeam,
        memberCount: selectedMemberIds.size,
      });
      onCreated(result.session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      setSubmitting(false);
    }
  }

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
              {team.orgName} · {team.name} · Step {step} of 2
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
              <Button type="button" className="flex-1" onClick={handleNext}>
                Next
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-8">
            <FieldSet>
              <FieldLegend>Access</FieldLegend>
              <FieldDescription>
                Choose who can access this session. You will be the facilitator.
              </FieldDescription>
              <FieldGroup data-slot="checkbox-group">
                <Field orientation="horizontal">
                  <Checkbox
                    id="share-whole-team"
                    checked={shareWholeTeam}
                    onCheckedChange={(checked) => setShareWholeTeam(checked === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="share-whole-team">Give the whole team access</FieldLabel>
                    <FieldDescription>
                      Every member of {team.name} can join this session.
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="create-invite"
                    checked={createInvite}
                    onCheckedChange={(checked) => setCreateInvite(checked === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="create-invite">Create invite link</FieldLabel>
                    <FieldDescription>
                      Generate a single-use link to share after creating the session.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Individual members</FieldLegend>
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
                      Invite a colleague to join {team.name} so you can include them in this
                      session.
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
                              void (teamInviteCopied
                                ? handleAddTeamMember()
                                : handleCopyTeamInvite())
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
                        <p className="text-xs text-muted-foreground">
                          {INVITE_LINK_SINGLE_USE_NOTE}
                        </p>
                      </div>
                    )}
                  </EmptyContent>
                </Empty>
              ) : (
                <FieldGroup data-slot="checkbox-group">
                  {members.map((member) => {
                    const userId = member.account.userId;
                    const checked = selectedMemberIds.has(userId);
                    return (
                      <Field key={userId} orientation="horizontal">
                        <input
                          id={`member-${userId}`}
                          type="checkbox"
                          className="size-4 rounded border border-input"
                          checked={checked}
                          onChange={() => toggleMember(userId)}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor={`member-${userId}`} className="w-full">
                            <AccountItem
                              account={member.account}
                              isCurrentUser={member.isCurrentUser}
                              variant="default"
                              size="sm"
                              className="border-0 p-0"
                            >
                              <AccountItemMedia />
                              <AccountItemContent>
                                <AccountItemTitle />
                              </AccountItemContent>
                            </AccountItem>
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
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? "Creating…" : "Create session"}
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
