import { Check, Copy, Globe, Lock, Plus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SessionAccessList } from "@/components/sessions/session-access-list";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { formatAccountDisplayName } from "@/lib/account-display";
import { copyTextToClipboard } from "@/lib/copy-text";
import {
  fetchSessionAccess,
  manageSessionScopes,
  type SessionAccess,
  type SessionLinkAccess,
  setSessionLinkAccess,
} from "@/lib/sessions-api";
import {
  fetchOrgTeams,
  fetchTeamMembers,
  type OrgTeamSummary,
  type TeamMemberSummary,
} from "@/lib/settings-api";

type Candidate =
  | { kind: "account"; member: TeamMemberSummary }
  | { kind: "team"; team: OrgTeamSummary };

type ShareSessionDialogProps = {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after any access change so panels can refresh their list. */
  onChanged?: () => void;
};

export function ShareSessionDialog({
  sessionId,
  open,
  onOpenChange,
  onChanged,
}: ShareSessionDialogProps) {
  // Visibility / link / candidate state — owned by the dialog
  const [access, setAccess] = useState<SessionAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  // Candidate pools
  const [teamMembers, setTeamMembers] = useState<TeamMemberSummary[]>([]);
  const [orgTeams, setOrgTeams] = useState<OrgTeamSummary[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetchSessionAccess(sessionId)
      .then((a) => {
        setAccess(a);
        void Promise.all([
          a.teamId ? fetchTeamMembers(a.teamId).then(setTeamMembers) : Promise.resolve(),
          a.orgId ? fetchOrgTeams(a.orgId).then(setOrgTeams) : Promise.resolve(),
        ]);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  // Candidates = team members + org teams not already in the access list
  const candidates = useMemo<Candidate[]>(() => {
    if (access === null) return [];
    const existingAccountIds = new Set(
      access.entries.filter((e) => e.kind === "account").map((e) => e.account.userId),
    );
    const existingTeamIds = new Set(
      access.entries.filter((e) => e.kind === "team").map((e) => e.team.id),
    );
    return [
      ...teamMembers
        .filter((m) => !existingAccountIds.has(m.account.userId))
        .map<Candidate>((m) => ({ kind: "account", member: m })),
      ...orgTeams
        .filter((t) => !existingTeamIds.has(t.team.id))
        .map<Candidate>((t) => ({ kind: "team", team: t })),
    ];
  }, [access, teamMembers, orgTeams]);

  async function handleVisibilityChange(value: string) {
    const linkAccess = value as SessionLinkAccess;
    setError(null);
    try {
      const updated = await setSessionLinkAccess(sessionId, linkAccess);
      setAccess(updated);
      setLinkCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update visibility");
    }
  }

  async function handleCopyLink() {
    if (access?.linkUrl == null) return;
    const url = new URL(access.linkUrl, window.location.origin).href;
    setError(null);
    try {
      await copyTextToClipboard(url);
      setLinkCopied(true);
    } catch {
      setError("Could not copy automatically. Select the link and copy manually.");
    }
  }

  async function handleAdd(candidate: Candidate) {
    setAddOpen(false);
    setAdding(true);
    setError(null);
    try {
      if (candidate.kind === "account") {
        await manageSessionScopes(sessionId, {
          add: { accountIds: [candidate.member.account.userId] },
        });
      } else {
        await manageSessionScopes(sessionId, { add: { teamIds: [candidate.team.team.id] } });
      }
      // Re-fetch access for updated candidate filtering, then refresh the list.
      const updated = await fetchSessionAccess(sessionId);
      setAccess(updated);
      setListRefreshKey((k) => k + 1);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add access");
    } finally {
      setAdding(false);
    }
  }

  function handleListRemoved() {
    // Re-fetch our own access state so candidates stay accurate.
    void fetchSessionAccess(sessionId).then(setAccess);
    onChanged?.();
  }

  const linkUrl =
    access?.linkUrl != null ? new URL(access.linkUrl, window.location.origin).href : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share session</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-4" />
          </div>
        ) : (
          <div className="space-y-5">
            {access?.canManage ? (
              <>
                {/* Visibility selector */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted">
                      {access.linkAccess === "anyone" ? (
                        <Globe className="size-4 text-muted-foreground" />
                      ) : (
                        <Lock className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <Select
                      value={access.linkAccess}
                      onValueChange={(v) => void handleVisibilityChange(v)}
                    >
                      <SelectTrigger size="sm" className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="restricted">
                          <span className="font-medium">Restricted</span>
                        </SelectItem>
                        <SelectItem value="anyone">
                          <span className="font-medium">Anyone with the link</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {access.linkAccess === "anyone" && linkUrl !== null ? (
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={linkUrl}
                        className="min-w-0 flex-1 font-mono text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCopyLink()}
                      >
                        {linkCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                        {linkCopied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  ) : null}
                </div>

                {/* Add people / teams combobox */}
                <div className="flex items-center gap-2">
                  <Popover open={addOpen} onOpenChange={setAddOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-muted-foreground"
                        disabled={adding || candidates.length === 0}
                      >
                        <Plus className="size-4" />
                        {candidates.length === 0
                          ? "Everyone is already added"
                          : "Add people or teams…"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search…" />
                        <CommandList>
                          <CommandEmpty>No matches found.</CommandEmpty>
                          {candidates.some((c) => c.kind === "account") ? (
                            <CommandGroup heading="People">
                              {candidates
                                .filter(
                                  (c): c is Extract<Candidate, { kind: "account" }> =>
                                    c.kind === "account",
                                )
                                .map((c) => (
                                  <CommandItem
                                    key={c.member.account.userId}
                                    value={formatAccountDisplayName(c.member.account)}
                                    onSelect={() => void handleAdd(c)}
                                  >
                                    <span className="truncate">
                                      {formatAccountDisplayName(c.member.account)}
                                    </span>
                                    {c.member.account.jobFunction ? (
                                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                        {c.member.account.jobFunction}
                                      </span>
                                    ) : null}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          ) : null}
                          {candidates.some((c) => c.kind === "team") ? (
                            <CommandGroup heading="Teams">
                              {candidates
                                .filter(
                                  (c): c is Extract<Candidate, { kind: "team" }> =>
                                    c.kind === "team",
                                )
                                .map((c) => (
                                  <CommandItem
                                    key={c.team.team.id}
                                    value={c.team.team.name}
                                    onSelect={() => void handleAdd(c)}
                                  >
                                    <span className="truncate">{c.team.team.name}</span>
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          ) : null}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {adding ? <Spinner className="size-4 shrink-0" /> : null}
                </div>
              </>
            ) : null}

            {/* Access list — self-loading, shared component */}
            <div className="space-y-2">
              {access?.canManage ? <Separator /> : null}
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <p className="text-sm font-medium">Who has access</p>
              </div>
              <SessionAccessList
                sessionId={sessionId}
                refreshKey={listRefreshKey}
                onRemoved={handleListRemoved}
              />
            </div>

            {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
