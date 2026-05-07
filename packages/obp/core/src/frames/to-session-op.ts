import type { Frame } from "./types.ts";

export type SessionOp = { kind: string; payload: unknown; session_id?: string };

export function frameToSessionOps(frame: Frame): SessionOp[] {
  switch (frame.type) {
    case "TURN":
      return [{ kind: "turn", payload: { actor: frame.actor, ...frame.body } }];
    case "TERMINATE":
      return [{ kind: "terminate", payload: frame.body }];
    default: {
      const _e: never = frame.type;
      return _e;
    }
  }
}

export function accumulateSessionOps(ops: SessionOp[], frame: Frame): void {
  ops.push(...frameToSessionOps(frame));
}

/** Appends frame-derived ops tagged with **`session_id`** (multiplex Merkle / replay partitioning). */
export function accumulateTaggedSessionOps(
  ops: SessionOp[],
  frame: Frame,
  session_id: string,
): void {
  for (const op of frameToSessionOps(frame)) {
    ops.push({ ...op, session_id });
  }
}
