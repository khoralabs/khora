import { describe, expect, test } from "bun:test";
import { OBPPersistenceClient } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { ObpLedger } from "../ledger.ts";
import type { PreparedTurn, TurnContract } from "../turn-contract.ts";
import { BilateralCoordinator } from "./bilateral.ts";

type StubAudit = { partyId: string; index: number };

function stubLedger(maxTurns: number): ObpLedger<StubAudit> {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new OBPPersistenceClient(persistence, { ledgerSeq });
  return new ObpLedger<StubAudit>({ client, persistence, ledgerSeq, maxTurns });
}

function stubContract(ledger: ObpLedger<StubAudit>): {
  contract: TurnContract<StubAudit>;
  prepares: string[];
  applies: string[];
} {
  const prepares: string[] = [];
  const applies: string[] = [];
  const contract: TurnContract<StubAudit> = {
    async prepare(partyId): Promise<PreparedTurn<unknown>> {
      prepares.push(partyId);
      return { kind: "structured", systemFragments: [], userMessage: `for ${partyId}` };
    },
    async apply(partyId, _raw): Promise<StubAudit> {
      const audit: StubAudit = { partyId, index: applies.length };
      applies.push(partyId);
      ledger.recordAudit(audit);
      return audit;
    },
  };
  return { contract, prepares, applies };
}

describe("BilateralCoordinator", () => {
  test("alternates parties starting with firstPartyId", async () => {
    const ledger = stubLedger(4);
    const { contract } = stubContract(ledger);
    const ranWith: string[] = [];
    const coord = new BilateralCoordinator<StubAudit>({
      ledger,
      parties: ["a", "b"],
      contract,
      firstPartyId: "b",
      runAgentTurn: async ({ partyId }) => {
        ranWith.push(partyId);
        return {};
      },
    });

    expect(coord.expectedActingPartyId()).toBe("b");
    const r1 = await coord.runNextTurn();
    expect(r1.ok).toBe(true);
    expect(coord.expectedActingPartyId()).toBe("a");
    const r2 = await coord.runNextTurn();
    expect(r2.ok).toBe(true);
    expect(ranWith).toEqual(["b", "a"]);
  });

  test("respects maxTurns: returns max_turns once exhausted", async () => {
    const ledger = stubLedger(1);
    const { contract } = stubContract(ledger);
    const coord = new BilateralCoordinator<StubAudit>({
      ledger,
      parties: ["a", "b"],
      contract,
      runAgentTurn: async () => ({}),
    });
    const r1 = await coord.runNextTurn();
    expect(r1.ok).toBe(true);
    const r2 = await coord.runNextTurn();
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error).toBe("max_turns");
    }
  });

  test("propagates runAgentTurn errors as structured failures (no turn advance)", async () => {
    const ledger = stubLedger(4);
    const { contract } = stubContract(ledger);
    const coord = new BilateralCoordinator<StubAudit>({
      ledger,
      parties: ["a", "b"],
      contract,
      runAgentTurn: async () => {
        throw new Error("provider exploded");
      },
    });
    const r = await coord.runNextTurn();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("provider exploded");
    }
    expect(ledger.completedTurns).toBe(0);
  });

  test("rejects firstPartyId not in parties", () => {
    const ledger = stubLedger(2);
    const { contract } = stubContract(ledger);
    expect(
      () =>
        new BilateralCoordinator<StubAudit>({
          ledger,
          parties: ["a", "b"],
          contract,
          firstPartyId: "c",
          runAgentTurn: async () => ({}),
        }),
    ).toThrow(/firstPartyId/);
  });
});
