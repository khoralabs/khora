import type { Frame, FrameType } from "./types.ts";

export type SessionOp = { kind: string; payload: unknown };

export function frameToSessionOps(type: FrameType, body: Record<string, unknown>): SessionOp[] {
  switch (type) {
    case "PROLIFERATE":
      return [{ kind: "proliferate", payload: body }];
    case "RESOLVE":
      return [{ kind: "resolve", payload: body }];
    case "TERMINATE":
      return [{ kind: "terminate", payload: body }];
    default: {
      const _e: never = type;
      return _e;
    }
  }
}

export function accumulateSessionOps(ops: SessionOp[], frame: Frame): void {
  ops.push(...frameToSessionOps(frame.type, frame.body));
}
