import type { AccountProfile } from "@shared/accounts/row";
import type { SessionAccessEntry, SessionTeamEntry } from "@shared/sessions/access";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import {
  AccountItem,
  AccountItemActions,
  AccountItemContent,
  AccountItemDescription,
  AccountItemMedia,
  AccountItemTitle,
} from "@/components/account/account-item";
import {
  TeamItem,
  TeamItemActions,
  TeamItemContent,
  TeamItemDescription,
  TeamItemMedia,
  TeamItemTitle,
} from "@/components/team/team-item";
import { Button } from "@/components/ui/button";
import { ItemGroup } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { fetchSessionAccess, manageSessionScopes } from "@/lib/sessions-api";
import { cn } from "@/lib/utils";

function isTeamEntry(entry: SessionAccessEntry): entry is SessionTeamEntry {
  return entry.kind === "team";
}

type SessionAccessListProps = {
  sessionId: string;
  /** Increment to trigger a re-fetch from outside. */
  refreshKey?: number;
  /** Called after a successful remove so parents can update their own state. */
  onRemoved?: () => void;
  canViewParticipantChats?: boolean;
  viewingParticipantUserId?: string | null;
  onViewParticipantChat?: (participant: AccountProfile) => void;
};

export function SessionAccessList({
  sessionId,
  refreshKey = 0,
  onRemoved,
  canViewParticipantChats = false,
  viewingParticipantUserId = null,
  onViewParticipantChat,
}: SessionAccessListProps) {
  const [entries, setEntries] = useState<SessionAccessEntry[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use a ref to track the refresh key so biome doesn't complain about
  // an "extra" dependency — we genuinely want to re-fetch when the key changes.
  const refreshKeyRef = useRef(refreshKey);

  function load() {
    setLoading(true);
    fetchSessionAccess(sessionId)
      .then((a) => {
        setEntries(a.entries);
        setCanManage(a.canManage);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load access");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [sessionId]);

  useEffect(() => {
    if (refreshKey === refreshKeyRef.current) return;
    refreshKeyRef.current = refreshKey;
    load();
  });

  async function handleRemoveAccount(userId: string) {
    setRemovingId(userId);
    setError(null);
    try {
      await manageSessionScopes(sessionId, { remove: { accountIds: [userId] } });
      const updated = await fetchSessionAccess(sessionId);
      setEntries(updated.entries);
      onRemoved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleRemoveTeam(teamId: string) {
    setRemovingId(teamId);
    setError(null);
    try {
      await manageSessionScopes(sessionId, { remove: { teamIds: [teamId] } });
      const updated = await fetchSessionAccess(sessionId);
      setEntries(updated.entries);
      onRemoved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner className="size-4" />
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No participants yet.</p>;
  }

  return (
    <div className="space-y-2">
      <ItemGroup className="gap-2">
        {entries.map((entry) => {
          if (isTeamEntry(entry)) {
            return (
              <TeamItem key={entry.team.id} team={entry.team} variant="outline" size="sm">
                <TeamItemMedia />
                <TeamItemContent>
                  <TeamItemTitle />
                  <TeamItemDescription>
                    {entry.role === "facilitator" ? "Facilitator team" : "Participant team"}
                  </TeamItemDescription>
                </TeamItemContent>
                {canManage && entry.role !== "facilitator" ? (
                  <TeamItemActions>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={removingId === entry.team.id}
                      onClick={() => void handleRemoveTeam(entry.team.id)}
                    >
                      {removingId === entry.team.id ? "Removing…" : "Remove"}
                    </Button>
                  </TeamItemActions>
                ) : null}
              </TeamItem>
            );
          }
          return (
            <AccountItem
              key={entry.account.userId}
              account={entry.account}
              isCurrentUser={entry.isCurrentUser}
              variant="outline"
              size="sm"
              className={cn(
                canViewParticipantChats &&
                  !entry.isCurrentUser &&
                  onViewParticipantChat !== undefined &&
                  "cursor-pointer transition-colors hover:bg-accent/50",
                viewingParticipantUserId === entry.account.userId && "border-primary bg-accent/40",
              )}
              {...(canViewParticipantChats &&
              !entry.isCurrentUser &&
              onViewParticipantChat !== undefined
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    onClick: () => onViewParticipantChat(entry.account),
                    onKeyDown: (event: KeyboardEvent) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onViewParticipantChat(entry.account);
                      }
                    },
                  }
                : {})}
            >
              <AccountItemMedia />
              <AccountItemContent>
                <AccountItemTitle />
                <AccountItemDescription>
                  {entry.context.role === "facilitator" ? "Facilitator" : "Participant"}
                  {canViewParticipantChats && !entry.isCurrentUser ? " · View interview" : null}
                </AccountItemDescription>
              </AccountItemContent>
              {canManage && entry.context.role !== "facilitator" && !entry.isCurrentUser ? (
                <AccountItemActions>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={removingId === entry.account.userId}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleRemoveAccount(entry.account.userId);
                    }}
                  >
                    {removingId === entry.account.userId ? "Removing…" : "Remove"}
                  </Button>
                </AccountItemActions>
              ) : null}
            </AccountItem>
          );
        })}
      </ItemGroup>
      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
