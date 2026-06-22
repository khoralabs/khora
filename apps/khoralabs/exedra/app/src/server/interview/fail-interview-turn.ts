import type { Database } from "bun:sqlite";

import { appendJobEvents, getJob, setJobStatus } from "../jobs/db.js";
import type { TurnEvent } from "./turn-engine/events.js";
import { rollbackAbortedTurn } from "./turn-engine/rollback.js";
import { relayTurnEvent } from "./turn-relay.js";

export async function failInterviewTurn(args: {
  db: Database;
  turnId: string;
  threadId: string;
  sessionId: string;
  teamId: string;
  userId: string;
  documentIds: readonly string[];
  error: string;
  emit?: (event: TurnEvent) => void;
}): Promise<void> {
  await rollbackAbortedTurn({
    db: args.db,
    turnId: args.turnId,
    sessionId: args.sessionId,
    teamId: args.teamId,
    userId: args.userId,
    documentIds: args.documentIds,
  });

  const event: TurnEvent = {
    type: "turn_failed",
    turnId: args.turnId,
    error: args.error,
  };

  const job = getJob(args.db, args.turnId);
  if (job !== null) {
    appendJobEvents(args.db, args.turnId, [
      {
        type: "turn_event",
        event: { type: "turn_failed", turnId: args.turnId, error: args.error },
      },
    ]);
    setJobStatus(args.db, args.turnId, "failed", { error: args.error });
  }

  if (args.emit !== undefined) {
    args.emit(event);
  } else {
    relayTurnEvent(args.threadId, event);
  }
}
