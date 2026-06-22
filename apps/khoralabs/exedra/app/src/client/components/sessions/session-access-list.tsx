import type { AccountProfile } from "@shared/accounts/row";
import type { SessionAccessEntry, SessionTeamEntry } from "@shared/sessions/access";
import { Info } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  onReturnToOwnInterview?: () => void;
};

export function SessionAccessList({
  sessionId,
  refreshKey = 0,
  onRemoved,
  canViewParticipantChats = false,
  viewingParticipantUserId = null,
  onViewParticipantChat,
  onReturnToOwnInterview,
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

  async function handleRemoveAccount(
    userId: string,
    role: "facilitator" | "facilitation" | "participant",
  ) {
    setRemovingId(userId);
    setError(null);
    try {
      if (role === "facilitation") {
        await manageSessionScopes(sessionId, { remove: { facilitationAccountIds: [userId] } });
      } else {
        await manageSessionScopes(sessionId, { remove: { accountIds: [userId] } });
      }
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
      <TooltipProvider>
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

            const viewingAnotherParticipant =
              viewingParticipantUserId !== null &&
              viewingParticipantUserId !== entry.account.userId;
            const canViewOtherChat =
              canViewParticipantChats &&
              !entry.isCurrentUser &&
              onViewParticipantChat !== undefined;
            const canReturnToOwnChat =
              canViewParticipantChats &&
              entry.isCurrentUser &&
              viewingAnotherParticipant &&
              onReturnToOwnInterview !== undefined;
            const isChatInteractive = canViewOtherChat || canReturnToOwnChat;
            const isViewingThisParticipant = viewingParticipantUserId === entry.account.userId;
            const interviewTooltip = entry.isCurrentUser
              ? "Return to your interview chat"
              : "View this person's interview chat";

            return (
              <AccountItem
                key={entry.account.userId}
                account={entry.account}
                isCurrentUser={entry.isCurrentUser}
                variant="outline"
                size="sm"
                className={cn(
                  isChatInteractive && "cursor-pointer transition-colors hover:bg-accent/50",
                  isViewingThisParticipant && "border-primary bg-accent/40",
                  canReturnToOwnChat && "border-primary/60 bg-accent/20",
                )}
                {...(isChatInteractive
                  ? {
                      role: "button" as const,
                      tabIndex: 0,
                      onClick: () => {
                        if (entry.isCurrentUser) {
                          onReturnToOwnInterview?.();
                          return;
                        }
                        onViewParticipantChat?.(entry.account);
                      },
                      onKeyDown: (event: KeyboardEvent) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        if (entry.isCurrentUser) {
                          onReturnToOwnInterview?.();
                          return;
                        }
                        onViewParticipantChat?.(entry.account);
                      },
                    }
                  : {})}
              >
                {canViewParticipantChats && isChatInteractive ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        aria-label={interviewTooltip}
                      >
                        <Info className="size-3.5" aria-hidden />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">{interviewTooltip}</TooltipContent>
                  </Tooltip>
                ) : null}
                <AccountItemMedia />
                <AccountItemContent>
                  <AccountItemTitle />
                  <AccountItemDescription>
                    {entry.context.role === "facilitator"
                      ? "Facilitator"
                      : entry.context.role === "facilitation"
                        ? "Facilitation"
                        : "Participant"}
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
                        void handleRemoveAccount(entry.account.userId, entry.context.role);
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
      </TooltipProvider>
      {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
