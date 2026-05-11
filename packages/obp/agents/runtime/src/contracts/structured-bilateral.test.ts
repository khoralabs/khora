import { describe, expect, test } from "bun:test";
import { OBPPersistenceClient } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { OBP_NEGOTIATION_BIND_NO_POLICY } from "../constants.ts";
import { ObpLedger } from "../ledger.ts";
import type { GraphSnapshotForPrompt } from "../prompt.ts";
import type { NegotiationTurnAudit } from "../runtime.ts";
import { createNegotiationStructuredBilateralContract } from "./structured-bilateral.ts";

const DEFAULT_PORT_TTL = { basis: "ledger_seq" as const, measure: 1_000_000 };

function fixture() {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new OBPPersistenceClient({ persistence, ledgerSeq });
  const { party: buyer } = persistence.registerParty({ name: "Buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "Seller", sourcemaps: [] });
  const ledger = new ObpLedger<NegotiationTurnAudit>({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 4,
  });
  const emptyGraph: GraphSnapshotForPrompt = {
    parties: [
      { id: buyer.id, name: "Buyer" },
      { id: seller.id, name: "Seller" },
    ],
    offers: [],
    ports: [],
    extends: [],
    exposes: [],
    binds: [],
  };
  const contract = createNegotiationStructuredBilateralContract({
    ledger,
    partyRoleName: (id) => (id === buyer.id ? "Buyer" : "Seller"),
    scenario: "Test scenario",
    getGraphSnapshot: () => emptyGraph,
    getPriorAuditsSummary: () => "",
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  return { ledger, contract, buyer, seller };
}

describe("createNegotiationStructuredBilateralContract", () => {
  test("genesis turn: prepare → apply writes one offer + ports, ledger records audit", async () => {
    const { ledger, contract, seller } = fixture();
    const probe = contract.hasNoBindableCounterpartyPorts;
    if (probe === undefined)
      throw new Error("contract should expose hasNoBindableCounterpartyPorts");
    expect(await probe(seller.id)).toBe(true);

    const prep = await contract.prepare(seller.id);
    expect(prep.kind).toBe("structured");
    expect(prep.zodOutputSchema).toBeDefined();
    expect(prep.userMessage).toContain("Seller");
    expect(prep.userMessage).toContain("Test scenario");
    expect(prep.metadata?.outputName).toBe("GenesisNegotiationTurn");

    const audit = await contract.apply(seller.id, {
      offerType: "seller.opening",
      ports: [
        {
          portType: "buyer.may_counter",
          terminal: false,
          promise: "Buyer may counter here.",
        },
      ],
    });
    expect(audit.kind).toBe("genesis");
    expect(audit.actingPartyId).toBe(seller.id);
    expect(ledger.completedTurns).toBe(1);
    expect(ledger.lastAudit()).toBe(audit);
  });

  test("bind turn: prepare exposes bind menu in metadata, apply succeeds with selected port", async () => {
    const { ledger, contract, buyer, seller } = fixture();

    const genesisPrep = await contract.prepare(seller.id);
    const genesisSchema = genesisPrep.zodOutputSchema;
    if (genesisSchema === undefined) throw new Error("genesis schema missing");
    await contract.apply(
      seller.id,
      genesisSchema.parse({
        offerType: "seller.opening",
        ports: [
          {
            portType: "buyer.may_counter",
            terminal: false,
            promise: "Buyer may counter here.",
          },
        ],
      }),
    );

    const prep = await contract.prepare(buyer.id);
    expect(prep.kind).toBe("structured");
    expect(prep.metadata?.outputName).toBe("NegotiationTurn");
    const menu = (prep.metadata?.bindMenu as Array<{ portId: string; portType: string }>) ?? [];
    expect(menu.length).toBeGreaterThanOrEqual(1);
    const counter = menu.find((m) => m.portType === "buyer.may_counter");
    if (counter === undefined) throw new Error("buyer.may_counter port missing from bind menu");

    const audit = await contract.apply(buyer.id, {
      offerType: "buyer.reply",
      [counter.portId]: OBP_NEGOTIATION_BIND_NO_POLICY,
      ports: [],
    });
    expect(audit.kind).toBe("bind");
    expect(ledger.completedTurns).toBe(2);
  });

  test("apply without prepare throws", async () => {
    const { contract, seller } = fixture();
    await expect(contract.apply(seller.id, {})).rejects.toThrow(/apply\(\) called before prepare/);
  });
});
