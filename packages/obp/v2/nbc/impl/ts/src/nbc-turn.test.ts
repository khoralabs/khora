import { describe, expect, test } from "bun:test";
import type { Offer, Party, Port } from "@khoralabs/obp-v2-model";
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
  ObpPersistenceStrategy,
  RegisterPartyInput,
  RegisterPartyOutput,
  SetOfferExpiredNowOutput,
  SetPortExpiredNowOutput,
} from "@khoralabs/obp-v2-persistence";
import { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { getBindablePortsForParty, isSessionAdvanceable, nbcNaturalStop } from "./nbc-session.ts";
import { applyNbcTurn } from "./nbc-turn.ts";
import { parseNbcTurnBody } from "./nbc-types.ts";

class InMemoryStrategy implements ObpPersistenceStrategy {
  private parties = new Map<string, Party>();
  private offers = new Map<string, Offer>();
  private ports = new Map<string, Port>();
  private extends = new Map<string, string>();
  private exposes = new Map<string, string>();
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
        bind_payload: input.bind_payload,
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
      bind_payload: input.bind_payload,
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

describe("applyNbcTurn", () => {
  test("extend + expose + bind", async () => {
    const client = new ObpPersistenceClient(new InMemoryStrategy());
    const { party: a } = await client.registerParty({ name: "A", sourcemaps: [] });
    const { party: b } = await client.registerParty({ name: "B", sourcemaps: [] });

    const bodyA = parseNbcTurnBody({
      offer: { id: "", expires_seq: 100n, type: "step", sourcemaps: [] },
      ports: [
        {
          id: "",
          type: "slot",
          promise: "pick",
          expires_seq: 100n,
          bind_policy: null,
          ref: "",
        },
      ],
      bind_port_id: "",
      bind_payload: null,
    });
    const r1 = await applyNbcTurn({ partyId: a.id, body: bodyA, client, ledgerSeq: 0n });
    expect(r1.exposedPortIds.length).toBe(1);
    const counterpartyPortId = r1.exposedPortIds[0];
    if (counterpartyPortId === undefined) throw new Error("expected port");

    const bodyB = parseNbcTurnBody({
      offer: { id: "", expires_seq: 100n, type: "reply", sourcemaps: [] },
      ports: [],
      bind_port_id: counterpartyPortId,
      bind_payload: {},
    });
    await applyNbcTurn({ partyId: b.id, body: bodyB, client, ledgerSeq: 0n });
    const binds = await client.listBinds();
    expect(binds.binds.some((x) => x.portId === counterpartyPortId)).toBe(true);
  });
});

describe("nbc session reads", () => {
  test("getBindablePortsForParty filters by extending party", async () => {
    const client = new ObpPersistenceClient(new InMemoryStrategy());
    const { party: alice } = await client.registerParty({ name: "Alice", sourcemaps: [] });
    const { party: bob } = await client.registerParty({ name: "Bob", sourcemaps: [] });

    const body = parseNbcTurnBody({
      offer: { id: "", expires_seq: 100n, type: "step", sourcemaps: [] },
      ports: [{ id: "", type: "x", promise: "", expires_seq: 100n, bind_policy: null, ref: "" }],
      bind_port_id: "",
      bind_payload: null,
    });
    const { exposedPortIds } = await applyNbcTurn({
      partyId: alice.id,
      body,
      client,
      ledgerSeq: 0n,
    });
    const pid = exposedPortIds[0];
    if (pid === undefined) throw new Error("port");

    const forBob = await getBindablePortsForParty(alice.id, client, 0n);
    expect(forBob.some((e) => e.portId === pid)).toBe(true);
    const forAlice = await getBindablePortsForParty(bob.id, client, 0n);
    expect(forAlice.some((e) => e.portId === pid)).toBe(false);
  });

  test("nbcNaturalStop after empty turn with no bindables", async () => {
    const client = new ObpPersistenceClient(new InMemoryStrategy());
    const { party } = await client.registerParty({ name: "Solo", sourcemaps: [] });
    const body = parseNbcTurnBody({
      offer: { id: "", expires_seq: 100n, type: "step", sourcemaps: [] },
      ports: [],
      bind_port_id: "",
      bind_payload: null,
    });
    await applyNbcTurn({ partyId: party.id, body, client, ledgerSeq: 0n });
    expect(await isSessionAdvanceable(client, 0n)).toBe(false);
    expect(await nbcNaturalStop(0, client, 0n)).toBe(true);
  });
});
