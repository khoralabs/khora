import { describe, expect, test } from "bun:test";
import { OBPPersistenceClient } from "@khoralabs/obp-persistence-client";
import { FakeObpPersistence } from "@khoralabs/obp-core/testing";
import { bytesToHex } from "./hash.ts";
import { inclusionProof, leafHashForOp, merkleRoot, verifyInclusion } from "./merkle.ts";
import { rollbackFakePersistence } from "./rollback.ts";
import { type Checkpoint, checkpointFromOps, verifyExtends } from "./verify.ts";

describe("@khoralabs/obp-session-sync", () => {
  test("merkle root stable for fixed fixture ops", () => {
    const ops = [
      { kind: "party", id: "p1", name: "A" },
      { kind: "party", id: "p2", name: "B" },
    ];
    const cp = checkpointFromOps(ops);
    expect(cp.seq).toBe(2);
    expect(cp.root_hex).toMatch(/^[0-9a-f]{64}$/);
    const again = checkpointFromOps(ops);
    expect(again.root_hex).toBe(cp.root_hex);
  });

  test("inclusion proof round-trip", () => {
    const ops = [{ k: 1 }, { k: 2 }, { k: 3 }];
    const leaves = ops.map(leafHashForOp);
    const root = merkleRoot(leaves);
    for (let i = 0; i < ops.length; i++) {
      const proof = inclusionProof(leaves, i);
      expect(
        verifyInclusion({
          root,
          leafHash: leaves[i]!,
          leafIndex: i,
          proof,
          leafCount: leaves.length,
        }),
      ).toBe(true);
    }
  });

  test("sequential append matches full rebuild root", () => {
    const ops = [{ n: 1 }, { n: 2 }, { n: 3 }];
    let prefix: unknown[] = [];
    let last = checkpointFromOps(prefix);
    for (const op of ops) {
      prefix = [...prefix, op];
      last = checkpointFromOps(prefix);
    }
    const full = checkpointFromOps(ops);
    expect(last.root_hex).toBe(full.root_hex);
    expect(last.seq).toBe(3);
  });

  test("verifyExtends rejects root mismatch", () => {
    const base = [{ a: 1 }];
    const delta = [{ b: 2 }];
    const wrong: Checkpoint = {
      seq: 2,
      root_hex: "00".repeat(32),
    };
    const r = verifyExtends({ baseOps: base, deltaOps: delta, claimed: wrong });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("ROOT_MISMATCH");
    }
  });

  test("verifyExtends accepts honest checkpoint", () => {
    const base = [{ a: 1 }];
    const delta = [{ b: 2 }];
    const honest = checkpointFromOps([...base, ...delta]);
    const r = verifyExtends({ baseOps: base, deltaOps: delta, claimed: honest });
    expect(r.ok).toBe(true);
  });

  test("rollbackFakePersistence restores exportState snapshot", () => {
    const ledgerSeq = () => 1;
    const p = new FakeObpPersistence(ledgerSeq);
    const client = new OBPPersistenceClient({ persistence: p, ledgerSeq });
    const { party: a } = client.registerParty({ name: "Only", sourcemaps: [] });
    const snap = p.exportState();
    client.registerParty({ name: "Extra", sourcemaps: [] });
    expect(p.parties.size).toBe(2);
    rollbackFakePersistence(p, snap);
    expect(p.parties.size).toBe(1);
    expect(p.getParty(a.id).kind).toBe("found");
  });

  test("empty op log checkpoint", () => {
    const cp = checkpointFromOps([]);
    expect(cp.seq).toBe(0);
    expect(cp.root_hex).toBe(bytesToHex(merkleRoot([])));
  });
});
