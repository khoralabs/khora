/**
 * Tests for `ObpPersistenceClient` using a minimal in-memory strategy.
 * The in-memory strategy also validates the strategy interface contract.
 */

import { describe, expect, test } from "bun:test";
import { ObpError } from "@khoralabs/obp-v2-errors";
import type { Offer, Party, Port } from "@khoralabs/obp-v2-model";
import { ObpPersistenceClient } from "./persistence-client.ts";
import type { ObpPersistenceStrategy } from "./persistence-strategy.ts";
import type {
  BindListingRow,
  BindPortInput,
  BindPortOutput,
  ExposedPortEdge,
  ExposePortInput,
  ExposePortOutput,
  ExtendOfferInput,
  ExtendOfferOutput,
  GetExtendingPartyIdInput,
  GetExtendingPartyIdOutput,
  GetOfferInput,
  GetOfferOutput,
  GetPartyInput,
  GetPartyOutput,
  GetPortInput,
  GetPortOutput,
  GetPortsSnapshotOutput,
  IsPortExposedInput,
  IsPortExposedOutput,
  ListBindsOutput,
  ListExposedPortEdgesOutput,
  RegisterPartyInput,
  RegisterPartyOutput,
  SetOfferExpiredNowOutput,
  SetPortExpiredNowOutput,
} from "./persistence-types.ts";

// ---------------------------------------------------------------------------
// Minimal in-memory strategy
// ---------------------------------------------------------------------------

class InMemoryStrategy implements ObpPersistenceStrategy {
  private parties = new Map<string, Party>();
  private offers = new Map<string, Offer>();
  private ports = new Map<string, Port>();
  private extends = new Map<string, string>(); // offerId -> partyId
  private exposes = new Map<string, string>(); // portId -> offerId
  private binds: BindListingRow[] = [];
  private seq = 0n;
  private nextId() {
    return `id-${++this.seq}`;
  }

  async registerParty(input: RegisterPartyInput): Promise<RegisterPartyOutput> {
    const party: Party = { id: this.nextId(), name: input.name, sourcemaps: input.sourcemaps };
    this.parties.set(party.id, party);
    return { party };
  }

  async getParty(input: GetPartyInput): Promise<GetPartyOutput> {
    const party = this.parties.get(input.id);
    return { result: party ? { kind: "party", party } : { kind: "notFound" } };
  }

  async getOffer(input: GetOfferInput): Promise<GetOfferOutput> {
    const offer = this.offers.get(input.id);
    return { result: offer ? { kind: "offer", offer } : { kind: "notFound" } };
  }

  async getPort(input: GetPortInput): Promise<GetPortOutput> {
    const port = this.ports.get(input.id);
    return { result: port ? { kind: "port", port } : { kind: "notFound" } };
  }

  async extendOffer(input: ExtendOfferInput): Promise<ExtendOfferOutput> {
    const offer: Offer = { ...input.offer, id: this.nextId() };
    this.offers.set(offer.id, offer);
    this.extends.set(offer.id, input.partyId);
    if (input.bindPortId) {
      this.binds.push({
        offerId: offer.id,
        portId: input.bindPortId,
        content_receipts: [],
        counterparty_bind: input.counterparty_bind,
        bind_policy_snapshot: null,
      });
    }
    return { offer };
  }

  async exposePort(input: ExposePortInput): Promise<ExposePortOutput> {
    const port: Port = { ...input.port, id: this.nextId() };
    this.ports.set(port.id, port);
    this.exposes.set(port.id, input.offerId);
    return { port };
  }

  async bindPort(input: BindPortInput): Promise<BindPortOutput> {
    this.binds.push({
      offerId: input.offerId,
      portId: input.portId,
      content_receipts: [],
      counterparty_bind: input.counterparty_bind,
      bind_policy_snapshot: null,
    });
    return {};
  }

  async listExposedPortEdges(): Promise<ListExposedPortEdgesOutput> {
    const edges: ExposedPortEdge[] = [];
    for (const [portId, offerId] of this.exposes) {
      edges.push({ offerId, portId });
    }
    return { edges };
  }

  async isPortExposed(input: IsPortExposedInput): Promise<IsPortExposedOutput> {
    return { exposed: this.exposes.has(input.portId) };
  }

  async listBinds(): Promise<ListBindsOutput> {
    return { binds: [...this.binds] };
  }

  async getPortsSnapshot(): Promise<GetPortsSnapshotOutput> {
    const entries = [...this.ports.entries()].map(([portId, port]) => ({ portId, port }));
    return { entries };
  }

  async getExtendingPartyId(input: GetExtendingPartyIdInput): Promise<GetExtendingPartyIdOutput> {
    return { partyId: this.extends.get(input.offerId) ?? "" };
  }

  async setPortExpiredNow(input: { portId: string }): Promise<SetPortExpiredNowOutput> {
    const port = this.ports.get(input.portId);
    if (port) this.ports.set(port.id, { ...port, expires_seq: 0n });
    return {};
  }

  async setOfferExpiredNow(input: { offerId: string }): Promise<SetOfferExpiredNowOutput> {
    const offer = this.offers.get(input.offerId);
    if (offer) this.offers.set(offer.id, { ...offer, expires_seq: 0n });
    return {};
  }
}

function makeClient() {
  return new ObpPersistenceClient(new InMemoryStrategy());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ObpPersistenceClient invariant 4", () => {
  test("rejects empty name", () => {
    const client = makeClient();
    expect(() => client.registerParty({ name: "  ", sourcemaps: [] })).toThrow(ObpError);
  });

  test("rejects blank name", () => {
    const client = makeClient();
    expect(() => client.registerParty({ name: "", sourcemaps: [] })).toThrow(ObpError);
  });
});

describe("registerParty + getPartyOrNull", () => {
  test("roundtrip", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Alice", sourcemaps: [] });
    expect(party.name).toBe("Alice");
    const found = await client.getPartyOrNull(party.id);
    expect(found?.name).toBe("Alice");
    expect(await client.getPartyOrNull("missing")).toBeNull();
  });
});

describe("extendOffer + getExtendingPartyId", () => {
  test("associates party to offer", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Bob", sourcemaps: [] });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", expires_seq: 9999n, type: "step", sourcemaps: [] },
      bindPortId: "",
      counterparty_bind: null,
    });
    expect(await client.getExtendingPartyId(offer.id)).toBe(party.id);
    expect(await client.getExtendingPartyId("unknown")).toBeNull();
  });
});

describe("exposePort + isPortExposed", () => {
  test("port exposed after exposePort", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Carol", sourcemaps: [] });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", expires_seq: 9999n, type: "step", sourcemaps: [] },
      bindPortId: "",
      counterparty_bind: null,
    });
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        expires_seq: 9999n,
        type: "slot",
        promise: "fill me",
        ref: "",
        sourcemaps: [],
      },
    });
    expect((await client.isPortExposed(port.id)).exposed).toBe(true);
    expect((await client.isPortExposed("ghost")).exposed).toBe(false);
  });
});

describe("bindPort + listBinds", () => {
  test("records bind row", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Dave", sourcemaps: [] });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", expires_seq: 9999n, type: "step", sourcemaps: [] },
      bindPortId: "",
      counterparty_bind: null,
    });
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: { id: "", expires_seq: 9999n, type: "slot", promise: "p", ref: "", sourcemaps: [] },
    });
    await client.bindPort({ offerId: offer.id, portId: port.id, counterparty_bind: null });
    const { binds } = await client.listBinds();
    expect(binds.some((b) => b.portId === port.id)).toBe(true);
  });
});

describe("getPortsSnapshot", () => {
  test("returns exposed ports", async () => {
    const client = makeClient();
    const { party } = await client.registerParty({ name: "Eve", sourcemaps: [] });
    const { offer } = await client.extendOffer({
      partyId: party.id,
      offer: { id: "", expires_seq: 9999n, type: "step", sourcemaps: [] },
      bindPortId: "",
      counterparty_bind: null,
    });
    await client.exposePort({
      offerId: offer.id,
      port: { id: "", expires_seq: 9999n, type: "slot", promise: "p", ref: "", sourcemaps: [] },
    });
    const snap = await client.getPortsSnapshot();
    expect(snap.entries.length).toBeGreaterThan(0);
  });
});

describe("getPartyOutput result union", () => {
  test("notFound kind", async () => {
    const client = makeClient();
    const out = await client.getParty({ id: "nope" });
    expect(out.result.kind).toBe("notFound");
  });
});
