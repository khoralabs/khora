import { describe, expect, test } from "bun:test";
import { OBPPersistenceClient } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { noopPortIdForHeadOffer, OBP_NEGOTIATION_BIND_NO_POLICY } from "../constants.ts";
import { ObpLedger } from "../ledger.ts";
import type { GraphSnapshotForPrompt } from "../prompt.ts";
import type { NegotiationTurnAudit } from "../runtime.ts";
import { createNegotiationStructuredBilateralContract } from "./structured-bilateral.ts";
import { createNegotiationToolLoopBilateralContract } from "./tool-loop-bilateral.ts";

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
    maxTurns: 8,
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
  const partyRoleName = (id: string) => (id === buyer.id ? "Buyer" : "Seller");
  const structured = createNegotiationStructuredBilateralContract({
    ledger,
    partyRoleName,
    getGraphSnapshot: () => emptyGraph,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const toolLoop = createNegotiationToolLoopBilateralContract({
    ledger,
    partyRoleName,
    getGraphSnapshot: () => emptyGraph,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  return { ledger, structured, toolLoop, buyer, seller };
}

describe("createNegotiationToolLoopBilateralContract", () => {
  test("hasNoBindableCounterpartyPorts: true on empty graph", async () => {
    const { toolLoop, seller } = fixture();
    const probe = toolLoop.hasNoBindableCounterpartyPorts;
    if (probe === undefined) throw new Error("contract should expose probe");
    expect(await probe(seller.id)).toBe(true);
  });

  test("prepare: allowedToolNames = static write tools + obp_bind__<portId> for each menu entry", async () => {
    const { structured, toolLoop, buyer, seller } = fixture();

    const genesisPrep = await structured.prepare(seller.id);
    const genesisSchema = genesisPrep.zodOutputSchema;
    if (genesisSchema === undefined) throw new Error("genesis schema missing");
    await structured.apply(
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

    const prep = await toolLoop.prepare(buyer.id);
    expect(prep.kind).toBe("tool-loop");
    const tools = prep.allowedToolNames ?? [];
    expect(tools).toContain("obp_extend_offer");
    expect(tools).toContain("obp_expose_port");
    expect(tools).toContain("obp_end_negotiation");
    const bindTool = tools.find((n) => n.startsWith("obp_bind__"));
    if (bindTool === undefined) throw new Error("expected obp_bind__<portId> tool");
    const menu = (prep.metadata?.bindMenu as Array<{ portId: string }>) ?? [];
    expect(menu.length).toBeGreaterThanOrEqual(1);
    const firstEntry = menu[0];
    if (firstEntry === undefined) throw new Error("bindMenu unexpectedly empty");
    expect(bindTool).toBe(`obp_bind__${firstEntry.portId}`);
  });

  test("apply: returns audit recorded by sibling contract since prepare", async () => {
    const { ledger, structured, toolLoop, buyer, seller } = fixture();

    const genesisPrep = await structured.prepare(seller.id);
    const genesisSchema = genesisPrep.zodOutputSchema;
    if (genesisSchema === undefined) throw new Error("genesis schema missing");
    await structured.apply(
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

    await toolLoop.prepare(buyer.id);

    // Sibling structured contract advances the graph during the "tool loop".
    const bindPrep = await structured.prepare(buyer.id);
    const bindSchema = bindPrep.zodOutputSchema;
    if (bindSchema === undefined) throw new Error("bind schema missing");
    const menu = (bindPrep.metadata?.bindMenu as Array<{ portId: string }>) ?? [];
    const first = menu[0];
    if (first === undefined) throw new Error("bind menu empty");
    const realAudit = await structured.apply(
      buyer.id,
      bindSchema.parse({
        offerType: "buyer.reply",
        [first.portId]: OBP_NEGOTIATION_BIND_NO_POLICY,
        ports: [],
      }),
    );

    const completedBefore = ledger.completedTurns;
    const result = await toolLoop.apply(buyer.id, {});
    expect(result).toBe(realAudit);
    expect(ledger.completedTurns).toBe(completedBefore);
  });

  test("apply: synthesises noop audit and bumps completedTurns when no audit was recorded", async () => {
    const { ledger, structured, toolLoop, buyer, seller } = fixture();

    const genesisPrep = await structured.prepare(seller.id);
    const genesisSchema = genesisPrep.zodOutputSchema;
    if (genesisSchema === undefined) throw new Error("genesis schema missing");
    await structured.apply(
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

    const prep = await toolLoop.prepare(buyer.id);
    const headOfferId = prep.metadata?.headOfferId as string | null;
    if (typeof headOfferId !== "string" || headOfferId.length === 0) {
      throw new Error("expected headOfferId in prepare metadata");
    }

    const completedBefore = ledger.completedTurns;
    const audit = await toolLoop.apply(buyer.id, {});
    expect(audit.kind).toBe("bind");
    if (audit.kind !== "bind") throw new Error("expected bind audit");
    expect(audit.bindKind).toBe("noop");
    expect(audit.chosenPortId).toBe(noopPortIdForHeadOffer(headOfferId));
    expect(ledger.completedTurns).toBe(completedBefore + 1);
    expect(ledger.lastAudit()).toBe(audit);
  });
});
