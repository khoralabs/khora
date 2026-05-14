import { describe, expect, test } from "bun:test";
import { frameToSessionOps } from "./frame-to-session-op.ts";
import { checkpointForSessionOps } from "./session-merkle.ts";
import type { SessionEnvelope, SessionOp } from "./session-protocol-types.ts";
import { verifySessionEnvelope } from "./session-verify.ts";

describe("verifySessionEnvelope", () => {
  test("accepts valid single delta from empty prefix", () => {
    const ops = frameToSessionOps({
      type: "TERMINATE",
      actor: "x",
      body: { reason: "done" },
    });
    const op = ops[0];
    expect(op).toBeDefined();
    if (op === undefined) {
      throw new Error("expected one op");
    }
    const base = checkpointForSessionOps([]);
    const e: SessionEnvelope = {
      session_id: "sid",
      from_party: "p1",
      base_checkpoint: base,
      delta_ops: [op],
      new_checkpoint: checkpointForSessionOps([op]),
    };
    expect(verifySessionEnvelope([], e)).toBeUndefined();
  });

  test("seqMismatch when base seq wrong", () => {
    const ops = frameToSessionOps({
      type: "TERMINATE",
      actor: "x",
      body: { reason: "r" },
    });
    const op = ops[0];
    expect(op).toBeDefined();
    if (op === undefined) {
      throw new Error("expected one op");
    }
    const base = checkpointForSessionOps([]);
    const wrongBase = { ...base, seq: 1n };
    const e: SessionEnvelope = {
      session_id: "s",
      from_party: "a",
      base_checkpoint: wrongBase,
      delta_ops: [op],
      new_checkpoint: checkpointForSessionOps([op]),
    };
    const err = verifySessionEnvelope([], e);
    expect(err).toBeDefined();
    expect(err && "seqMismatch" in err).toBe(true);
  });

  test("rootMismatch when new root wrong", () => {
    const op: SessionOp = {
      kind: "turn",
      payload: { a: 1 },
      session_id: "",
    };
    const base = checkpointForSessionOps([]);
    const newBad = {
      ...checkpointForSessionOps([op]),
      root_hex: checkpointForSessionOps([]).root_hex,
    };
    const e: SessionEnvelope = {
      session_id: "s",
      from_party: "a",
      base_checkpoint: base,
      delta_ops: [op],
      new_checkpoint: newBad,
    };
    const err = verifySessionEnvelope([], e);
    expect(err && "rootMismatch" in err).toBe(true);
  });
});
