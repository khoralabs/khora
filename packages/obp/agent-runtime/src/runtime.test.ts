import { expect, test } from "bun:test";
import { ObpClient } from "@cfd/obp-core";
import { FakeObpPersistence } from "@cfd/obp-core/testing";
import { expiresAtFromHours } from "@cfd/obp-tools";
import { noopPortIdForHeadOffer, walkAwayPortIdForHeadOffer } from "./constants.ts";
import { NegotiationRuntime } from "./runtime.ts";
import { buildNegotiationTurnOutput } from "./turn-output-schema.ts";

const DEFAULT_PORT_TTL = { basis: "hours" as const, measure: 24 };

function seedSellerListing(): {
  now: () => number;
  persistence: FakeObpPersistence;
  client: ObpClient;
  buyerId: string;
  sellerId: string;
  listingPortId: string;
  seedOfferId: string;
} {
  const t = { v: 1_700_000_000_000 };
  const now = () => t.v;
  const persistence = new FakeObpPersistence(now);
  const client = new ObpClient(persistence, { now });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const { offer: seed } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: now(),
      ts_expired: expiresAtFromHours(now(), 24),
      type: "demo.seed",
      sourcemaps: [],
    },
  });
  const { port: listing } = client.exposePort({
    offerId: seed.id,
    port: {
      id: "",
      ts_created: now(),
      ts_expired: expiresAtFromHours(now(), 24),
      type: "listing|100",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });
  return {
    now,
    persistence,
    client,
    buyerId: buyer.id,
    sellerId: seller.id,
    listingPortId: listing.id,
    seedOfferId: seed.id,
  };
}

test("happy path: bind counterparty port and expose multiple ports", async () => {
  const { now, persistence, client, buyerId, listingPortId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    now,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { allowedPortIds, schema } = await rt.prepareActingTurn(buyerId);
  const idx = allowedPortIds.indexOf(listingPortId);
  expect(idx).toBeGreaterThanOrEqual(0);
  const raw = {
    bindChoiceIndex: idx,
    offerType: "buyer.counter",
    ports: [
      { portType: "path-a", terminal: false },
      { portType: "path-b", terminal: false },
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
  const { now, persistence, client, buyerId } = seedSellerListing();
  let endReason: string | undefined;
  const rt = new NegotiationRuntime({
    client,
    persistence,
    now,
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
  const walkIdx = allowedPortIds.indexOf(walkId);
  expect(walkIdx).toBeGreaterThanOrEqual(0);
  const audit = rt.applyTurn(
    buyerId,
    schema.parse({
      bindChoiceIndex: walkIdx,
      offerType: "buyer.exit",
    }),
  );
  expect(audit.kind).toBe("bind");
  expect(audit.bindKind).toBe("walkAway");
  expect(endReason).toBe("walk-away");
});

test("noop bind completes extend + bind", async () => {
  const { now, persistence, client, buyerId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    now,
    maxTurns: 5,
    requireNoop: true,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema, allowedPortIds, headOfferId } = await rt.prepareActingTurn(buyerId);
  const noopId = noopPortIdForHeadOffer(headOfferId);
  const noopIdx = allowedPortIds.indexOf(noopId);
  expect(noopIdx).toBeGreaterThanOrEqual(0);
  rt.applyTurn(
    buyerId,
    schema.parse({
      bindChoiceIndex: noopIdx,
      offerType: "buyer.noop",
      ports: [{ portType: "keep-alive", terminal: false }],
    }),
  );
  const binds = persistence.listBinds();
  expect(binds.some((b) => b.portId === noopId)).toBe(true);
});

test("maxTurns blocks further turns", async () => {
  const { now, persistence, client, buyerId, listingPortId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    now,
    maxTurns: 1,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema, allowedPortIds } = await rt.prepareActingTurn(buyerId);
  const idx = allowedPortIds.indexOf(listingPortId);
  rt.applyTurn(
    buyerId,
    schema.parse({
      bindChoiceIndex: idx,
      offerType: "one",
      ports: [],
    }),
  );
  expect(() => rt.prepareActingTurn(buyerId)).toThrow(/maxTurns/);
});

test("genesis turn then bind turn", async () => {
  const t = { v: 1_700_000_000_000 };
  const now = () => t.v;
  const persistence = new FakeObpPersistence(now);
  const client = new ObpClient(persistence, { now });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const rt = new NegotiationRuntime({
    client,
    persistence,
    now,
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
      ports: [{ portType: "buyer.may_counter", terminal: false }],
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
  const bindIdx = allowedPortIds.indexOf(portId);
  const bAudit = rt.applyTurn(
    buyer.id,
    schema.parse({
      bindChoiceIndex: bindIdx,
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
  const now = () => t.v;
  const persistence = new FakeObpPersistence(now);
  const client = new ObpClient(persistence, { now });
  persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const rt = new NegotiationRuntime({
    client,
    persistence,
    now,
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
      ports: [{ portType: "buyer.may_counter", terminal: false }],
    }),
  );
  const head = gAudit.newOfferId;
  const noopId = noopPortIdForHeadOffer(head);
  const walkId = walkAwayPortIdForHeadOffer(head);
  const exposed = client.listExposedPortEdges();
  expect(exposed.some((e) => e.offerId === head && e.portId === noopId)).toBe(true);
  expect(exposed.some((e) => e.offerId === head && e.portId === walkId)).toBe(true);
});

test("terminal counterparty bind omits ports from validator (.strict rejects ports key)", async () => {
  const t = { v: 1_700_000_000_000 };
  const now = () => t.v;
  const persistence = new FakeObpPersistence(now);
  const client = new ObpClient(persistence, { now });
  const { party: buyer } = persistence.registerParty({ name: "buyer", sourcemaps: [] });
  const { party: seller } = persistence.registerParty({ name: "seller", sourcemaps: [] });
  const { offer: seed } = client.extendOffer({
    partyId: seller.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: now(),
      ts_expired: expiresAtFromHours(now(), 24),
      type: "demo.seed",
      sourcemaps: [],
    },
  });
  const { port: listing } = client.exposePort({
    offerId: seed.id,
    port: {
      id: "",
      ts_created: now(),
      ts_expired: expiresAtFromHours(now(), 24),
      type: "deal.final",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  const rt = new NegotiationRuntime({
    client,
    persistence,
    now,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema, allowedPortIds } = await rt.prepareActingTurn(buyer.id);
  const termIdx = allowedPortIds.indexOf(listing.id);
  expect(termIdx).toBeGreaterThanOrEqual(0);
  expect(schema.safeParse({ bindChoiceIndex: termIdx, offerType: "agreed" }).success).toBe(true);
  expect(
    schema.safeParse({ bindChoiceIndex: termIdx, offerType: "agreed", ports: [] }).success,
  ).toBe(false);
  expect(
    schema.safeParse({
      bindChoiceIndex: termIdx,
      offerType: "agreed",
      ports: [{ portType: "extra", terminal: false }],
    }).success,
  ).toBe(false);
});

test("getBindSnapshotForParty matches prepareActingTurn allowed ids", async () => {
  const { now, persistence, client, buyerId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    now,
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

test("schema rejects bindChoiceIndex out of range", () => {
  const schema = buildNegotiationTurnOutput(["only-port"], [false], { allowAgentPortTtl: true });
  const r = schema.safeParse({
    bindChoiceIndex: 1,
    offerType: "x",
    ports: [],
  });
  expect(r.success).toBe(false);
});

test("requireNoop false omits noop from choices", async () => {
  const { now, persistence, client, buyerId } = seedSellerListing();
  const rt = new NegotiationRuntime({
    client,
    persistence,
    now,
    maxTurns: 5,
    requireNoop: false,
    requireWalkAway: false,
    defaultPortTtl: DEFAULT_PORT_TTL,
  });
  const { schema, allowedPortIds, headOfferId } = await rt.prepareActingTurn(buyerId);
  expect(allowedPortIds.length).toBe(1);
  const noopId = noopPortIdForHeadOffer(headOfferId);
  expect(allowedPortIds.includes(noopId)).toBe(false);
  const r = schema.safeParse({
    bindChoiceIndex: 1,
    offerType: "x",
    ports: [],
  });
  expect(r.success).toBe(false);
});
