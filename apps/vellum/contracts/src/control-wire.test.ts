import { describe, expect, test } from "bun:test";
import {
  ChainInitRequestSchema,
  ChainInitWireSchema,
  DEFAULT_GENESIS_TURN_WIRE,
} from "./control-wire.ts";

const sampleInit = ChainInitWireSchema.parse({
  session_id: "sid-a",
  genesis_hash: "00".repeat(32),
  party_ids: ["party-a", "party-b"],
  actor_pubkeys: ["11".repeat(32), "22".repeat(32)],
});

describe("ChainInitRequestSchema", () => {
  test("requires genesis_turn", () => {
    const r = ChainInitRequestSchema.safeParse({ init: sampleInit });
    expect(r.success).toBe(false);
  });

  test("accepts init + genesis_turn", () => {
    const r = ChainInitRequestSchema.safeParse({
      init: sampleInit,
      genesis_turn: DEFAULT_GENESIS_TURN_WIRE,
    });
    expect(r.success).toBe(true);
  });
});
