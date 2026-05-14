import type { JsonDocument, SessionOp } from "./session-protocol-types.ts";

const UNTAGGED_SESSION_ID = "";

/** Minimal frame shape for deriving session ops (TURN / TERMINATE only). */
export type FrameLikeForSessionOp = {
  type: "TURN" | "TERMINATE";
  actor: string;
  body: Record<string, unknown>;
};

function bodyToDocument(body: Record<string, unknown>): JsonDocument {
  return JSON.parse(JSON.stringify(body)) as JsonDocument;
}

export function frameToSessionOps(frame: FrameLikeForSessionOp): SessionOp[] {
  switch (frame.type) {
    case "TURN":
      return [
        {
          kind: "turn",
          payload: bodyToDocument({ actor: frame.actor, ...frame.body }),
          session_id: UNTAGGED_SESSION_ID,
        },
      ];
    case "TERMINATE":
      return [
        {
          kind: "terminate",
          payload: bodyToDocument(frame.body),
          session_id: UNTAGGED_SESSION_ID,
        },
      ];
    default: {
      const _e: never = frame.type;
      return _e;
    }
  }
}

export function accumulateSessionOps(ops: SessionOp[], frame: FrameLikeForSessionOp): void {
  ops.push(...frameToSessionOps(frame));
}

/** Appends frame-derived ops tagged with **`session_id`** (multiplex Merkle / replay partitioning). */
export function accumulateTaggedSessionOps(
  ops: SessionOp[],
  frame: FrameLikeForSessionOp,
  session_id: string,
): void {
  for (const op of frameToSessionOps(frame)) {
    ops.push({ ...op, session_id });
  }
}
