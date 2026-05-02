import { expect, test } from "bun:test";
import { ObpClient } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import {
  noopPortIdForHeadOffer,
  OBP_NEGOTIATION_BIND_NO_POLICY,
  walkAwayPortIdForHeadOffer,
} from "./constants.ts";
import { NegotiationRuntime } from "./runtime.ts";
import { buildNegotiationTurnOutput } from "./turn-output-schema.ts";

const DEFAULT_PORT_TTL = { basis: "ledger_seq" as const, measure: 1_000_000 };

function farExpires(seq: number): number {
  return seq + 10_000_000;
}

function seedSellerListing(): {
  ledgerSeq: () => number;
  persistence: FakeObpPersistence;
  client: ObpClient;
  buyerId: string;
  sellerId: string;
  listingPortId: string;
  seedOfferId: string;
} {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new ObpClient(persistence, { ledgerSeq });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const seq = ledgerSeq();
  const { offer: seed } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      created_seq: seq,
      expires_seq: farExpires(seq),
      type: "demo.seed",
      sourcemaps: [],
    },
  });
  const { port: listing } = client.exposePort({
    offerId: seed.id,
    port: {
      id: "",
      created_seq: seq,
      expires_seq: farExpires(seq),
      type: "listing|100",
      promise: "Listing affordance for tests.",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });
  return {
    ledgerSeq,
    persistence,
    client,
    buyerId: buyer.id,
    sellerId: seller.id,
    listingPortId: listing.id,
    seedOfferId: seed.id,
  };
}

test("happy path: bind counterparty port and expose multiple ports", async () => {
  const { ledgerSeq, persistence, client, buyerId, listingPortId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { allowedPortIds, schema } = await rt.prepareActingTurn(buyerId);
  expect(allowedPortIds.includes(listingPortId)).toBe(true);
  const raw = {
    [listingPortId]: OBP_NEGOTIATION_BIND_NO_POLICY,
    offerType: "buyer.counter",
    ports: [
      { portType: "path-a", terminal: false, promise: "Path A." },
      { portType: "path-b", terminal: false, promise: "Path B." },
    ],
  };
  const parsed = schema.parse(raw);
  const audit = rt.applyTurn(buyerId, parsed);
  expect(audit.kind).toBe("bind");
  expect(audit.newOfferId).toBeDefined();
  expect(audit.exposedPortIds.length).toBe(2);
  expect(audit.bindKind).toBe("real");
  expect(audit.bindMenu.some((b) => b.portId === listingPortId)).toBe(true);
  expect(audit.chosenPortType).toBe("listing|100");
  expect(audit.newOfferType).toBe("buyer.counter");
  const binds = persistence.listBinds();
  expect(binds.some((b) => b.portId === listingPortId)).toBe(true);
});

test("walk-away bind calls requestNegotiationEnd", async () => {
  const { ledgerSeq, persistence, client, buyerId } = seedSellerListing();
  let endReason: string | undefined;
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: true,
    defaultPortTtl: DEFAULT_PORT_TTL,
    requestNegotiationEnd: (a) => {
      endReason = a.reason;
    },
  });
  const { schema, allowedPortIds, headOfferId } = await rt.prepareActingTurn(buyerId);
  const walkId = walkAwayPortIdForHeadOffer(headOfferId);
  expect(allowedPortIds.includes(walkId)).toBe(true);
  const audit = rt.applyTurn(
    buyerId,
    schema.parse({
      [walkId]: OBP_NEGOTIATION_BIND_NO_POLICY,
      offerType: "buyer.exit",
    }),
  );
  expect(audit.kind).toBe("bind");
  expect(audit.bindKind).toBe("walkAway");
  expect(endReason).toBe("walk-away");
});

test("noop bind completes extend + bind", async () => {
  const { ledgerSeq, persistence, client, buyerId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: true,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema, allowedPortIds, headOfferId } = await rt.prepareActingTurn(buyerId);
  const noopId = noopPortIdForHeadOffer(headOfferId);
  expect(allowedPortIds.includes(noopId)).toBe(true);
  rt.applyTurn(
    buyerId,
    schema.parse({
      [noopId]: OBP_NEGOTIATION_BIND_NO_POLICY,
      offerType: "buyer.noop",
      ports: [{ portType: "keep-alive", terminal: false, promise: "Keep session alive." }],
    }),
  );
  const binds = persistence.listBinds();
  expect(binds.some((b) => b.portId === noopId)).toBe(true);
});

test("maxTurns blocks further turns", async () => {
  const { ledgerSeq, persistence, client, buyerId, listingPortId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 1,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema, allowedPortIds } = await rt.prepareActingTurn(buyerId);
  rt.applyTurn(
    buyerId,
    schema.parse({
      [listingPortId]: OBP_NEGOTIATION_BIND_NO_POLICY,
      offerType: "one",
      ports: [],
    }),
  );
  expect(() => rt.prepareActingTurn(buyerId)).toThrow(/maxTurns/);
});

test("genesis turn then bind turn", async () => {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new ObpClient(persistence, { ledgerSeq });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });

  expect(await rt.hasNoBindableCounterpartyPorts(seller.id)).toBe(true);
  const { schema: gSchema } = await rt.prepareGenesisTurn(seller.id);
  const gAudit = rt.applyGenesisTurn(
    seller.id,
    gSchema.parse({
      offerType: "seller.opening",
      ports: [
        {
          portType: "buyer.may_counter",
          terminal: false,
          promise: "Counterparty may respond here.",
        },
      ],
    }),
  );
  expect(gAudit.kind).toBe("genesis");
  expect(gAudit.newOfferType).toBe("seller.opening");
  expect(gAudit.exposedPorts[0]?.portType).toBe("buyer.may_counter");

  const { schema, allowedPortIds } = await rt.prepareActingTurn(buyer.id);
  const portId = allowedPortIds.find((id) => {
    const pr = client.getPort(id);
    return pr.kind === "found" && pr.port.type === "buyer.may_counter";
  });
  if (portId === undefined) {
    throw new Error("expected buyer.may_counter port in allowedPortIds");
  }
  const bAudit = rt.applyTurn(
    buyer.id,
    schema.parse({
      [portId]: OBP_NEGOTIATION_BIND_NO_POLICY,
      offerType: "buyer.reply",
      ports: [],
    }),
  );
  expect(bAudit.kind).toBe("bind");
  expect(bAudit.chosenPortType).toBe("buyer.may_counter");
  expect(bAudit.counterpartyHeadOfferType).toBe("seller.opening");
});

test("genesis attaches noop/walk-away on new offer before counterparty prepareActingTurn", async () => {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new ObpClient(persistence, { ledgerSeq });
  persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: true,
    requireWalkAway: true,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema: gSchema } = await rt.prepareGenesisTurn(seller.id);
  const gAudit = rt.applyGenesisTurn(
    seller.id,
    gSchema.parse({
      offerType: "seller.opening",
      ports: [
        {
          portType: "buyer.may_counter",
          terminal: false,
          promise: "Buyer counter affordance.",
        },
      ],
    }),
  );
  const head = gAudit.newOfferId;
  const noopId = noopPortIdForHeadOffer(head);
  const walkId = walkAwayPortIdForHeadOffer(head);
  const exposed = client.listExposedPortEdges();
  expect(exposed.some((e) => e.offerId === head && e.portId === noopId)).toBe(true);
  expect(exposed.some((e) => e.offerId === head && e.portId === walkId)).toBe(true);
});

test("bind turn requires counterparty_bind when listing port has bind_policy", async () => {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new ObpClient(persistence, { ledgerSeq });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const seq = ledgerSeq();
  const { offer: seed } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      created_seq: seq,
      expires_seq: farExpires(seq),
      type: "demo.seed",
      sourcemaps: [],
    },
  });
  const { port: listing } = client.exposePort({
    offerId: seed.id,
    port: {
      id: "",
      created_seq: seq,
      expires_seq: farExpires(seq),
      type: "listing|100",
      promise: "Listing with bind policy.",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
      bind_policy: {
        version: "1",
        properties: [
          {
            type: "text",
            name: "Reference",
            prompt: "Your reference id",
            constraints: { minLength: 1 },
          },
        ],
      },
    },
  });
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema, allowedPortIds } = await rt.prepareActingTurn(buyer.id);
  expect(allowedPortIds.includes(listing.id)).toBe(true);
  expect(
    schema.safeParse({
      [listing.id]: true,
      offerType: "buyer.counter",
      ports: [{ portType: "path-a", terminal: false, promise: "Path A." }],
    }).success,
  ).toBe(false);
  const parsed = schema.parse({
    [listing.id]: { reference: "R1" },
    offerType: "buyer.counter",
    ports: [{ portType: "path-a", terminal: false, promise: "Path A." }],
  });
  const audit = rt.applyTurn(buyer.id, parsed);
  expect(audit.kind).toBe("bind");
  expect(audit.counterpartyBind).toEqual({ reference: "R1" });
});

test("terminal counterparty bind omits ports from validator (.strict rejects ports key)", async () => {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new ObpClient(persistence, { ledgerSeq });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const seq = ledgerSeq();
  const { offer: seed } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      created_seq: seq,
      expires_seq: farExpires(seq),
      type: "demo.seed",
      sourcemaps: [],
    },
  });
  const { port: listing } = client.exposePort({
    offerId: seed.id,
    port: {
      id: "",
      created_seq: seq,
      expires_seq: farExpires(seq),
      type: "deal.final",
      promise: "Terminal deal port.",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema, allowedPortIds } = await rt.prepareActingTurn(buyer.id);
  expect(allowedPortIds.includes(listing.id)).toBe(true);
  expect(
    schema.safeParse({
      [listing.id]: OBP_NEGOTIATION_BIND_NO_POLICY,
      offerType: "agreed",
    }).success,
  ).toBe(true);
  expect(
    schema.safeParse({
      [listing.id]: OBP_NEGOTIATION_BIND_NO_POLICY,
      offerType: "agreed",
      ports: [],
    }).success,
  ).toBe(false);
  expect(
    schema.safeParse({
      [listing.id]: OBP_NEGOTIATION_BIND_NO_POLICY,
      offerType: "agreed",
      ports: [{ portType: "extra", terminal: false, promise: "Extra." }],
    }).success,
  ).toBe(false);
});

test("terminal bind creates offer with no exposes (no model ports, no noop/walk)", async () => {
  const t = { v: 1_700_000_000_000 };
  const ledgerSeq = () => t.v;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const client = new ObpClient(persistence, { ledgerSeq });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const seq = ledgerSeq();
  const { offer: seed } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      created_seq: seq,
      expires_seq: farExpires(seq),
      type: "demo.seed",
      sourcemaps: [],
    },
  });
  const { port: listing } = client.exposePort({
    offerId: seed.id,
    port: {
      id: "",
      created_seq: seq,
      expires_seq: farExpires(seq),
      type: "deal.final",
      promise: "Terminal deal port.",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: true,
    requireWalkAway: true,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema } = await rt.prepareActingTurn(buyer.id);
  const audit = rt.applyTurn(
    buyer.id,
    schema.parse({
      [listing.id]: OBP_NEGOTIATION_BIND_NO_POLICY,
      offerType: "agreed",
    }),
  );
  expect(audit.exposedPortIds.length).toBe(0);
  const onNewOffer = client.listExposedPortEdges().filter((e) => e.offerId === audit.newOfferId);
  expect(onNewOffer.length).toBe(0);
});

test("getBindSnapshotForParty matches prepareActingTurn allowed ids", async () => {
  const { ledgerSeq, persistence, client, buyerId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const snap = await rt.getBindSnapshotForParty(buyerId);
  expect(snap).not.toBeNull();
  const { schema, allowedPortIds } = await rt.prepareActingTurn(buyerId);
  const snapIds = new Set(snap?.bindMenu.map((b) => b.portId) ?? []);
  for (const id of allowedPortIds) {
    expect(snapIds.has(id)).toBe(true);
  }
  void schema;
});

test("schema rejects multiple bind keys", () => {
  const schema = buildNegotiationTurnOutput(
    [
      { portId: "port-a", terminal: false, affordanceDescription: "A" },
      { portId: "port-b", terminal: false, affordanceDescription: "B" },
    ],
    { allowAgentPortTtl: true },
  );
  const r = schema.safeParse({
    offerType: "x",
    "port-a": OBP_NEGOTIATION_BIND_NO_POLICY,
    "port-b": OBP_NEGOTIATION_BIND_NO_POLICY,
  });
  expect(r.success).toBe(false);
});

test("requireNoop false omits noop from choices", async () => {
  const { ledgerSeq, persistence, client, buyerId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    ledgerSeq,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema, allowedPortIds, headOfferId } = await rt.prepareActingTurn(buyerId);
  expect(allowedPortIds.length).toBe(1);
  const noopId = noopPortIdForHeadOffer(headOfferId);
  expect(allowedPortIds.includes(noopId)).toBe(false);
  const listingId = allowedPortIds[0];
  if (listingId === undefined) {
    throw new Error("expected listing port");
  }
  const r = schema.safeParse({
    offerType: "x",
    "not-a-real-port-in-schema": OBP_NEGOTIATION_BIND_NO_POLICY,
  });
  expect(r.success).toBe(false);
  expect(
    schema.safeParse({
      offerType: "x",
      [listingId]: OBP_NEGOTIATION_BIND_NO_POLICY,
    }).success,
  ).toBe(true);
});
