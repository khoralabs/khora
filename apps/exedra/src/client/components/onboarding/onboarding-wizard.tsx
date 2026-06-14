import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type MeTeam, mintTeamInvite, postOnboarding } from "@/lib/me-api";

type OnboardingWizardProps = {
  onComplete: (team: MeTeam) => void;
};

type WizardStep = 1 | 2 | 3;

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [orgName, setOrgName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [team, setTeam] = useState<MeTeam | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

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
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create team");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyLink() {
    if (inviteUrl === null) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFinish() {
    if (team === null) return;
    onComplete(team);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Set up Exedra</CardTitle>
        <CardDescription>Step {step} of 3</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 1 ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Corp"
                autoFocus
              />
            </div>
            <Button
              className="w-full"
              disabled={orgName.trim().length === 0}
              onClick={() => {
                setError(null);
                setStep(2);
              }}
            >
              Next
            </Button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Product leadership"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={submitting || teamName.trim().length === 0}
                onClick={() => void handleCreateTeam()}
              >
                {submitting ? "Creating…" : "Create team"}
              </Button>
            </div>
          </>
        ) : null}

        {step === 3 && team !== null ? (
          <>
            <p className="text-sm text-muted-foreground">
              Share this link with colleagues so they can join {team.name} on Exedra.
            </p>
            <Input readOnly value={inviteUrl ?? "Generating invite link…"} />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={inviteUrl === null}
                onClick={() => void handleCopyLink()}
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button className="flex-1" onClick={handleFinish}>
                Skip for now
              </Button>
            </div>
          </>
        ) : null}

        {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
