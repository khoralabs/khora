import { describe, expect, test } from "bun:test";
import { frameToSessionOps } from "./frame-to-session-op.ts";
import {
  checkpointForSessionOps,
  emptySessionOpLogRootHex,
  merkleRootHexFromLeafDigests,
  sessionOpLeafDigest,
} from "./session-merkle.ts";
import type { SessionOp } from "./session-protocol-types.ts";

describe("emptySessionOpLogRootHex", () => {
  test("stable 64-char hex", () => {
    const h = emptySessionOpLogRootHex();
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(emptySessionOpLogRootHex());
  });
});

describe("checkpointForSessionOps", () => {
  test("n=0 matches empty log root", () => {
    const cp = checkpointForSessionOps([]);
    expect(cp.seq).toBe(0n);
    expect(cp.root_hex).toBe(emptySessionOpLogRootHex());
  });

  test("single op", () => {
    const op: SessionOp = {
      kind: "turn",
      payload: { actor: "a", x: 1 },
      session_id: "",
    };
    const cp = checkpointForSessionOps([op]);
    expect(cp.seq).toBe(1n);
    expect(cp.root_hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("merkleRootHexFromLeafDigests", () => {
  test("one leaf", () => {
    const d = sessionOpLeafDigest({
      kind: "terminate",
      payload: { reason: "r" },
      session_id: "",
    });
    expect(merkleRootHexFromLeafDigests([d])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("frame-derived op hashes into checkpoint", () => {
  test("frameToSessionOps produces spec SessionOp", () => {
    const ops = frameToSessionOps({
      type: "TURN",
      actor: "0xaa",
      body: { offerId: "o1" },
    });
    const op = ops[0];
    expect(op).toBeDefined();
    if (op === undefined) {
      throw new Error("expected one op");
    }
    expect(op.session_id).toBe("");
    expect(op.kind).toBe("turn");
    const cp = checkpointForSessionOps([op]);
    expect(cp.seq).toBe(1n);
  });
});
