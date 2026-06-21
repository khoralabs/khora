import { Plus } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { copyTextToClipboard } from "@/lib/copy-text";
import { INVITE_LINK_SINGLE_USE_NOTE } from "@/lib/invite-copy";
import { mintTeamInvite } from "@/lib/me-api";
import { fetchOrgTeams, type OrgTeamSummary } from "@/lib/settings-api";

type InviteMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
  | { variant: "team"; teamId: string; teamName: string }
  | { variant: "org"; orgId: string; orgName: string }
);

export function InviteMemberDialog(props: InviteMemberDialogProps) {
  const orgId = props.variant === "org" ? props.orgId : undefined;
  const teamId = props.variant === "team" ? props.teamId : undefined;
  const teamName = props.variant === "team" ? props.teamName : undefined;
  const orgName = props.variant === "org" ? props.orgName : undefined;

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [mintingInvite, setMintingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<OrgTeamSummary[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [step, setStep] = useState<"pick-team" | "invite">("pick-team");

  useEffect(() => {
    if (!props.open) return;
    setInviteUrl(null);
    setMintingInvite(false);
    setCopied(false);
    setError(null);
    setSelectedTeamId(null);
    setStep(props.variant === "org" ? "pick-team" : "invite");
  }, [props.open, props.variant]);

  useEffect(() => {
    if (!props.open || props.variant !== "org" || step !== "pick-team" || orgId === undefined)
      return;

    let cancelled = false;
    setTeamsLoading(true);
    void fetchOrgTeams(orgId)
      .then((data) => {
        if (cancelled) return;
        setTeams(data);
        if (data.length === 1) {
          setSelectedTeamId(data[0]?.team.id ?? null);
        }
        setTeamsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load teams");
        setTeamsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [props.open, props.variant, orgId, step]);

  useEffect(() => {
    if (!props.open || props.variant !== "team" || teamId === undefined || inviteUrl !== null)
      return;

    let cancelled = false;
    setMintingInvite(true);
    void mintTeamInvite(teamId)
      .then((invite) => {
        if (cancelled) return;
        setInviteUrl(new URL(invite.url, window.location.origin).href);
        setMintingInvite(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not create invite link");
        setMintingInvite(false);
      });

    return () => {
      cancelled = true;
    };
  }, [props.open, props.variant, teamId, inviteUrl]);

  async function mintForTeam(teamId: string) {
    setMintingInvite(true);
    setError(null);
    try {
      const result = await mintTeamInvite(teamId);
      setInviteUrl(new URL(result.url, window.location.origin).href);
      setCopied(false);
      setStep("invite");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite link");
    } finally {
      setMintingInvite(false);
    }
  }

  async function handleCopyLink() {
    if (inviteUrl === null) return;
    await copyTextToClipboard(inviteUrl);
    setCopied(true);
  }

  async function handleNewLink() {
    const mintTeamId = teamId ?? selectedTeamId;
    if (mintTeamId === null) return;
    setInviteUrl(null);
    setCopied(false);
    await mintForTeam(mintTeamId);
  }

  const targetTeamName =
    teamName ?? teams.find((team) => team.team.id === selectedTeamId)?.team.name ?? "the team";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            {props.variant === "org"
              ? `Add someone to ${orgName} via a single-use invite link.`
              : `Add someone to ${teamName} via a single-use invite link.`}
          </DialogDescription>
        </DialogHeader>

        {props.variant === "org" && step === "pick-team" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-team">Team</Label>
              {teamsLoading ? (
                <div className="flex justify-center py-4">
                  <Spinner className="size-4" />
                </div>
              ) : teams.length === 0 ? (
                <p className="text-sm text-muted-foreground">No teams in this organization yet.</p>
              ) : (
                <Select
                  value={selectedTeamId ?? undefined}
                  onValueChange={(value) => setSelectedTeamId(value)}
                >
                  <SelectTrigger id="invite-team" className="w-full">
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.team.id} value={team.team.id}>
                        {team.team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              className="w-full"
              disabled={selectedTeamId === null || mintingInvite || teams.length === 0}
              onClick={() => {
                if (selectedTeamId === null) return;
                void mintForTeam(selectedTeamId);
              }}
            >
              {mintingInvite ? <Spinner className="size-4" aria-hidden /> : "Continue"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this link to invite someone to join {targetTeamName}.{" "}
              {INVITE_LINK_SINGLE_USE_NOTE}
            </p>
            <Input
              readOnly
              disabled={copied}
              value={inviteUrl ?? (mintingInvite ? "Generating invite link…" : "")}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={inviteUrl === null || mintingInvite}
                onClick={() => void (copied ? handleNewLink() : handleCopyLink())}
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
              <Button className="flex-1" onClick={() => props.onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}

        {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
