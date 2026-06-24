import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useAnalytics } from "@/lib/analytics";
import { type MeTeam, postOnboarding } from "@/lib/me-api";

type OnboardingDialogProps = {
  open: boolean;
  onComplete: (team: MeTeam) => void;
};

type WizardStep = 1 | 2;

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const track = useAnalytics();
  const [step, setStep] = useState<WizardStep>(1);
  const [orgName, setOrgName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setOrgName("");
    setTeamName("");
    setError(null);
    setSubmitting(false);
  }, [open]);

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
      const createdTeam: MeTeam = {
        id: result.team.id,
        name: result.team.name,
        orgId: result.org.id,
        orgName: result.org.name,
        avatarUrl: null,
        orgAvatarUrl: null,
      };
      track("onboarding_completed", { teamId: createdTeam.id, orgId: createdTeam.orgId });
      onComplete(createdTeam);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create team");
    } finally {
      setSubmitting(false);
    }
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
          <div className="mb-1 flex items-center gap-2">
            {step > 1 ? (
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
            ) : null}
            <DialogTitle>Set up Exedra</DialogTitle>
          </div>

          <DialogDescription>Step {step} of 2</DialogDescription>
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

          {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
