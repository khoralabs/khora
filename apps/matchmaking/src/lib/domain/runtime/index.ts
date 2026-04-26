import {
  type MatchmakingDomainPersistence,
  SqliteMatchmakingDomainPersistence,
} from "../persistence/matchmaking-domain-persistence.ts";
import { getMatchmakingDomainDatabase } from "../persistence/open-domain-db.ts";

/**
 * App domain entry: profiles, invites, bookings, reflections, and lexical `Store` backing
 * (via {@link getMatchmakingDomainDatabase}).
 */
export class MatchmakingDomainRuntime {
  constructor(readonly persistence: MatchmakingDomainPersistence) {}
}

let runtimeSingleton: MatchmakingDomainRuntime | null = null;

export function getMatchmakingDomainRuntime(): MatchmakingDomainRuntime {
  if (runtimeSingleton !== null) {
    return runtimeSingleton;
  }
  const db = getMatchmakingDomainDatabase();
  const persistence: MatchmakingDomainPersistence = new SqliteMatchmakingDomainPersistence(db);
  runtimeSingleton = new MatchmakingDomainRuntime(persistence);
  return runtimeSingleton;
}

export function resetMatchmakingDomainRuntimeForTest(): void {
  runtimeSingleton = null;
}
