import type { Database } from "bun:sqlite";

import { getTeam } from "../db/membership";
import { bootstrapSessionMemories } from "../memories/bootstrap";

export async function bootstrapSessionMemoriesForTeamSession(
  db: Database,
  params: { teamId: string; sessionId: string; userIds: readonly string[] },
): Promise<void> {
  const team = await getTeam(db, params.teamId);
  if (team === null) {
    throw new Error("Team not found");
  }

  bootstrapSessionMemories({
    orgId: team.orgId,
    teamId: params.teamId,
    sessionId: params.sessionId,
    userIds: params.userIds,
  });
}
