import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

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
import { type MeTeam, postCreateTeam } from "@/lib/me-api";

type CreateTeamDialogProps = {
  open: boolean;
  org: Pick<MeTeam, "orgId" | "orgName">;
  onOpenChange: (open: boolean) => void;
  onCreated: (team: MeTeam) => void;
};

export function CreateTeamDialog({ open, org, onOpenChange, onCreated }: CreateTeamDialogProps) {
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTeamName("");
    setError(null);
    setSubmitting(false);
  }, [open]);

  async function handleSubmit() {
    const trimmed = teamName.trim();
    if (trimmed.length === 0) {
      setError("Team name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await postCreateTeam(org.orgId, trimmed);
      onCreated(result.team);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create team");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>Add a team to {org.orgName}.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
          aria-busy={submitting}
        >
          <Label htmlFor="create-team-name" className="sr-only">
            Team name
          </Label>
          <InputGroup className="h-11" {...(submitting ? { "data-disabled": true as const } : {})}>
            <InputGroupInput
              id="create-team-name"
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

          {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
