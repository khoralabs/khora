import { describe, expect, test } from "bun:test";
import { ObpError } from "@khoralabs/obp-v2-errors";
import {
  accumulateSessionOps,
  accumulateTaggedSessionOps,
  frameToSessionOps,
} from "./frame-to-session-op.ts";
import type { SessionOp } from "./session-protocol-types.ts";

describe("frameToSessionOps", () => {
  test("TURN", () => {
    const ops = frameToSessionOps({
      type: "TURN",
      actor: "0xaa",
      body: { offerId: "o1", offerType: "t" },
    });
    expect(ops).toEqual([
      {
        kind: "turn",
        payload: { actor: "0xaa", offerId: "o1", offerType: "t" },
        session_id: "",
      },
    ]);
  });

  test("TERMINATE", () => {
    const ops = frameToSessionOps({
      type: "TERMINATE",
      actor: "0xbb",
      body: { reason: "done" },
    });
    expect(ops).toEqual([{ kind: "terminate", payload: { reason: "done" }, session_id: "" }]);
  });
});

describe("accumulateSessionOps", () => {
  test("appends", () => {
    const ops: SessionOp[] = [];
    accumulateSessionOps(ops, {
      type: "TURN",
      actor: "a",
      body: {},
    });
    expect(ops).toHaveLength(1);
    const first = ops[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error("expected one op");
    }
    expect(first.session_id).toBe("");
  });
});

describe("accumulateTaggedSessionOps", () => {
  test("tags session_id", () => {
    const ops: SessionOp[] = [];
    accumulateTaggedSessionOps(
      ops,
      { type: "TERMINATE", actor: "x", body: { reason: "r" } },
      "sid-1",
    );
    expect(ops).toEqual([{ kind: "terminate", payload: { reason: "r" }, session_id: "sid-1" }]);
  });
});

describe("ObpError from session surface", () => {
  test("import path", () => {
    expect(new ObpError("VALIDATION", "x")).toBeInstanceOf(ObpError);
  });
});
