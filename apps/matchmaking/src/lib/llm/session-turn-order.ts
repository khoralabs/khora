/**
 * Which party index speaks in {@code round} for matchmaking (0 = Party A / requester).
 * When the human has posted an invitation as Party A, Party B (invitee) responds first.
 */
export function matchmakingRoundPartyIndex(
  round: number,
  partyCount: number,
  hasInvitation: boolean,
): number {
  if (partyCount < 1) {
    throw new Error("matchmakingRoundPartyIndex: partyCount must be >= 1");
  }
  if (!hasInvitation) {
    return round % partyCount;
  }
  return (round + 1) % partyCount;
}
