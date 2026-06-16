import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { copyTextToClipboard } from "@/lib/copy-text";
import { INVITE_LINK_SINGLE_USE_NOTE } from "@/lib/invite-copy";
import { type MeTeam, mintTeamInvite, postOnboarding } from "@/lib/me-api";

type OnboardingDialogProps = {
  open: boolean;
  onComplete: (sessionId: string) => void;
};

type WizardStep = 1 | 2 | 3;

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [orgName, setOrgName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [team, setTeam] = useState<MeTeam | null>(null);
  const [onboardingSessionId, setOnboardingSessionId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mintingInvite, setMintingInvite] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setOrgName("");
    setTeamName("");
    setTeam(null);
    setOnboardingSessionId(null);
    setInviteUrl(null);
    setError(null);
    setSubmitting(false);
    setCopied(false);
    setMintingInvite(false);
  }, [open]);

  useEffect(() => {
    if (step !== 3 || team === null || inviteUrl !== null) return;

    let cancelled = false;
    void mintTeamInvite(team.id)
      .then((invite) => {
        if (cancelled) return;
        setInviteUrl(new URL(invite.url, window.location.origin).href);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not create invite link");
      });

    return () => {
      cancelled = true;
    };
  }, [step, team, inviteUrl]);

  async function handleCreateTeam() {
    const trimmedOrg = orgName.trim();
    const trimmedTeam = teamName.trim();
    if (trimmedOrg.length === 0 || trimmedTeam.length === 0) {
      setError("Organization and team names are required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await postOnboarding({ orgName: trimmedOrg, teamName: trimmedTeam });
      setTeam({
        id: result.team.id,
        name: result.team.name,
        orgId: result.org.id,
        orgName: result.org.name,
      });
      setOnboardingSessionId(result.onboardingSessionId);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create team");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyLink() {
    if (inviteUrl === null) return;
    try {
      await copyTextToClipboard(inviteUrl);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. Select the link and copy manually.");
    }
  }

  async function handleNewInviteLink() {
    if (team === null) return;
    setMintingInvite(true);
    setCopied(false);
    setError(null);
    try {
      const invite = await mintTeamInvite(team.id);
      setInviteUrl(new URL(invite.url, window.location.origin).href);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create invite link");
    } finally {
      setMintingInvite(false);
    }
  }

  function handleFinish() {
    if (onboardingSessionId === null) return;
    onComplete(onboardingSessionId);
  }

  function handleBack() {
    setError(null);
    if (step === 2) setStep(1);
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onPointerDownOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader className="text-left">
          {step > 1 ? (
            <div className="mb-1 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleBack}
                disabled={submitting}
                aria-label="Back"
              >
                <ArrowLeft />
              </Button>
              {step === 2 ? (
                <p className="truncate text-sm text-muted-foreground">{orgName}</p>
              ) : null}
            </div>
          ) : null}
          <DialogTitle>Set up Exedra</DialogTitle>
          <DialogDescription>Step {step} of 3</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 1 ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (orgName.trim().length === 0) return;
                setError(null);
                setStep(2);
              }}
            >
              <Label htmlFor="org-name" className="sr-only">
                Organization name
              </Label>
              <InputGroup className="h-11">
                <InputGroupInput
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Organization name"
                  autoFocus
                  required
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="submit"
                    size="icon-sm"
                    disabled={orgName.trim().length === 0}
                    aria-label="Next"
                  >
                    <ArrowRight className="size-4" aria-hidden />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          ) : null}

          {step === 2 ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateTeam();
              }}
              aria-busy={submitting}
            >
              <Label htmlFor="team-name" className="sr-only">
                Team name
              </Label>
              <InputGroup
                className="h-11"
                {...(submitting ? { "data-disabled": true as const } : {})}
              >
                <InputGroupInput
                  id="team-name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Team name"
                  autoFocus
                  disabled={submitting}
                  required
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="submit"
                    size="icon-sm"
                    disabled={submitting || teamName.trim().length === 0}
                    aria-label={submitting ? "Creating team" : "Create team"}
                  >
                    {submitting ? (
                      <Spinner className="size-4" aria-hidden />
                    ) : (
                      <ArrowRight className="size-4" aria-hidden />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          ) : null}

          {step === 3 && team !== null ? (
            <>
              <p className="text-sm text-muted-foreground">
                Share this link with colleagues so they can join {team.name} on Exedra.{" "}
                {INVITE_LINK_SINGLE_USE_NOTE}
              </p>
              <Input readOnly disabled={copied} value={inviteUrl ?? "Generating invite link…"} />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={inviteUrl === null || mintingInvite}
                  onClick={() => void (copied ? handleNewInviteLink() : handleCopyLink())}
                >
                  {copied ? (
                    <>
                      <Plus />
                      New link
                    </>
                  ) : (
                    "Copy link"
                  )}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleFinish}
                  disabled={onboardingSessionId === null}
                >
                  Start interview
                </Button>
              </div>
            </>
          ) : null}

          {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
