import { describe, expect, test } from "bun:test";
import type { JsonDocument, Offer, Party, Port } from "@khoralabs/obp-v2-model";
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
  GetNbcBindWindowForOfferInput,
  GetNbcBindWindowForOfferOutput,
  GetNbcBindWindowForPortInput,
  GetNbcBindWindowForPortOutput,
  GetOfferInput,
  GetOfferOutput,
  GetPartyInput,
  GetPartyOutput,
  GetPortBindPolicyInput,
  GetPortBindPolicyOutput,
  GetPortInput,
  GetPortOutput,
  GetPortsSnapshotInput,
  GetPortsSnapshotOutput,
  IsPortExposedInput,
  IsPortExposedOutput,
  ListBindsInput,
  ListBindsOutput,
  ListExposedPortEdgesInput,
  ListExposedPortEdgesOutput,
  ObpPersistenceStrategy,
  RegisterPartyInput,
  RegisterPartyOutput,
  SetOfferExpiredNowOutput,
  SetPortExpiredNowOutput,
} from "@khoralabs/obp-v2-persistence";
import { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { validateVellumBindPayloadForPort } from "@khoralabs/vellum-bind-policy";
import { getBindablePortsForParty, isSessionAdvanceable, nbcNaturalStop } from "./nbc-session.ts";
import { applyNbcTurn } from "./nbc-turn.ts";
import { parseNbcTurnBody } from "./nbc-types.ts";

class InMemoryStrategy implements ObpPersistenceStrategy {
  private parties = new Map<string, Party>();
  private offers = new Map<string, Offer>();
  private ports = new Map<string, Port>();
  private offerNbc = new Map<
    string,
    { nbc_expires_turn: number; nbc_expires_at_relay_ms: number }
  >();
  private portNbc = new Map<
    string,
    { nbc_expires_turn: number; nbc_expires_at_relay_ms: number }
  >();
  private extends = new Map<string, string>();
  private exposes = new Map<string, string>();
  private portBindPolicies = new Map<string, JsonDocument>();
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

  async getPortBindPolicy(input: GetPortBindPolicyInput): Promise<GetPortBindPolicyOutput> {
    if (!this.ports.has(input.portId)) return { result: { kind: "notFound" } };
    return {
      result: {
        kind: "found",
        bind_policy: this.portBindPolicies.get(input.portId) ?? null,
      },
    };
  }

  async extendOffer(input: ExtendOfferInput): Promise<ExtendOfferOutput> {
    const offer: Offer = { ...input.offer, id: this.nextId() };
    this.offers.set(offer.id, offer);
    this.extends.set(offer.id, input.partyId);
    this.offerNbc.set(offer.id, {
      nbc_expires_turn: input.nbc_expires_turn ?? 0,
      nbc_expires_at_relay_ms: input.nbc_expires_at_relay_ms ?? 0,
    });
    if (input.bindPortId.trim() !== "") {
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
    this.portBindPolicies.set(port.id, input.bind_policy ?? null);
    this.exposes.set(port.id, input.offerId);
    this.portNbc.set(port.id, {
      nbc_expires_turn: input.nbc_expires_turn ?? 0,
      nbc_expires_at_relay_ms: input.nbc_expires_at_relay_ms ?? 0,
    });
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

  async listExposedPortEdges(
    _input: ListExposedPortEdgesInput,
  ): Promise<ListExposedPortEdgesOutput> {
    const edges: ExposedPortEdge[] = [];
    for (const [portId, offerId] of this.exposes) {
      edges.push({ offerId, portId });
    }
    return { edges };
  }

  async isPortExposed(input: IsPortExposedInput): Promise<IsPortExposedOutput> {
    return { exposed: this.exposes.has(input.portId) };
  }

  async listBinds(_input: ListBindsInput): Promise<ListBindsOutput> {
    return { binds: [...this.binds] };
  }

  async getPortsSnapshot(_input: GetPortsSnapshotInput): Promise<GetPortsSnapshotOutput> {
    const entries = [...this.ports.entries()].map(([portId, port]) => ({ portId, port }));
    return { entries };
  }

  async getExtendingPartyId(input: GetExtendingPartyIdInput): Promise<GetExtendingPartyIdOutput> {
    return { partyId: this.extends.get(input.offerId) ?? "" };
  }

  async getNbcBindWindowForOffer(
    input: GetNbcBindWindowForOfferInput,
  ): Promise<GetNbcBindWindowForOfferOutput> {
    if (!this.offers.has(input.offerId)) return { result: { kind: "notFound" } };
    const w = this.offerNbc.get(input.offerId) ?? {
      nbc_expires_turn: 0,
      nbc_expires_at_relay_ms: 0,
    };
    return { result: { kind: "window", window: w } };
  }

  async getNbcBindWindowForPort(
    input: GetNbcBindWindowForPortInput,
  ): Promise<GetNbcBindWindowForPortOutput> {
    if (!this.ports.has(input.portId)) return { result: { kind: "notFound" } };
    const w = this.portNbc.get(input.portId) ?? {
      nbc_expires_turn: 0,
      nbc_expires_at_relay_ms: 0,
    };
    return { result: { kind: "window", window: w } };
  }

  async setPortExpiredNow(input: { portId: string }): Promise<SetPortExpiredNowOutput> {
    if (this.ports.has(input.portId)) {
      this.portNbc.set(input.portId, { nbc_expires_turn: 0, nbc_expires_at_relay_ms: 1 });
    }
    return {};
  }

  async setOfferExpiredNow(input: { offerId: string }): Promise<SetOfferExpiredNowOutput> {
    if (this.offers.has(input.offerId)) {
      this.offerNbc.set(input.offerId, { nbc_expires_turn: 0, nbc_expires_at_relay_ms: 1 });
    }
    for (const [portId, offerId] of this.exposes) {
      if (offerId !== input.offerId) continue;
      if (this.ports.has(portId)) {
        this.portNbc.set(portId, { nbc_expires_turn: 0, nbc_expires_at_relay_ms: 1 });
      }
    }
    return {};
  }
}

const timing0 = { turnSeq: 0, relayTsMs: 1 } as const;

const textBindSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["greeting"],
  properties: {
    greeting: {
      type: "string" as const,
      minLength: 1,
      description: "A short hello",
    },
  },
};

describe("applyNbcTurn", () => {
  test("extend + expose + bind", async () => {
    const client = new ObpPersistenceClient(new InMemoryStrategy());
    const { party: a } = await client.registerParty({ name: "A", sourcemaps: [] });
    const { party: b } = await client.registerParty({ name: "B", sourcemaps: [] });

    const bodyA = parseNbcTurnBody({
      offer: { id: "", expires_turn: 100, expires_at_relay_ms: 0, type: "step", sourcemaps: [] },
      ports: [
        {
          id: "",
          type: "slot",
          promise: "pick",
          expires_turn: 100,
          expires_at_relay_ms: 0,
          bind_policy: null,
          ref: "",
        },
      ],
      bind_port_id: "",
      bind_payload: null,
    });
    const r1 = await applyNbcTurn({ partyId: a.id, body: bodyA, client, timing: timing0 });
    expect(r1.exposedPortIds.length).toBe(1);
    const counterpartyPortId = r1.exposedPortIds[0];
    if (counterpartyPortId === undefined) throw new Error("expected port");

    const bodyB = parseNbcTurnBody({
      offer: { id: "", expires_turn: 100, expires_at_relay_ms: 0, type: "reply", sourcemaps: [] },
      ports: [],
      bind_port_id: counterpartyPortId,
      bind_payload: {},
    });
    await applyNbcTurn({ partyId: b.id, body: bodyB, client, timing: timing0 });
    const binds = await client.listBinds();
    expect(binds.binds.some((x) => x.portId === counterpartyPortId)).toBe(true);
  });

  test("persisted bind_policy enables later-turn bind with normalized payload", async () => {
    const client = new ObpPersistenceClient(new InMemoryStrategy());
    const { party: a } = await client.registerParty({ name: "A", sourcemaps: [] });
    const { party: b } = await client.registerParty({ name: "B", sourcemaps: [] });

    const bodyA = parseNbcTurnBody({
      offer: { id: "", expires_turn: 100, expires_at_relay_ms: 0, type: "step", sourcemaps: [] },
      ports: [
        {
          id: "",
          type: "slot",
          promise: "pick",
          expires_turn: 100,
          expires_at_relay_ms: 0,
          bind_policy: textBindSchema,
          ref: "",
        },
      ],
      bind_port_id: "",
      bind_payload: null,
    });
    const r1 = await applyNbcTurn({ partyId: a.id, body: bodyA, client, timing: timing0 });
    const pid = r1.exposedPortIds[0];
    if (pid === undefined) throw new Error("expected port");

    const bodyB = parseNbcTurnBody({
      offer: { id: "", expires_turn: 100, expires_at_relay_ms: 0, type: "reply", sourcemaps: [] },
      ports: [],
      bind_port_id: pid,
      bind_payload: { greeting: "yo" },
    });
    await applyNbcTurn({
      partyId: b.id,
      body: bodyB,
      client,
      timing: timing0,
      validateBindPayload: (bp, pl) => validateVellumBindPayloadForPort(bp, pl) as JsonDocument,
    });
    const { binds } = await client.listBinds();
    const row = binds.find((x) => x.portId === pid);
    expect(row?.bind_payload).toEqual({ greeting: "yo" });
  });
});

describe("nbc session reads", () => {
  test("getBindablePortsForParty filters by extending party", async () => {
    const client = new ObpPersistenceClient(new InMemoryStrategy());
    const { party: alice } = await client.registerParty({ name: "Alice", sourcemaps: [] });
    const { party: bob } = await client.registerParty({ name: "Bob", sourcemaps: [] });

    const body = parseNbcTurnBody({
      offer: { id: "", expires_turn: 100, expires_at_relay_ms: 0, type: "step", sourcemaps: [] },
      ports: [
        {
          id: "",
          type: "x",
          promise: "",
          expires_turn: 100,
          expires_at_relay_ms: 0,
          bind_policy: null,
          ref: "",
        },
      ],
      bind_port_id: "",
      bind_payload: null,
    });
    const { exposedPortIds } = await applyNbcTurn({
      partyId: alice.id,
      body,
      client,
      timing: timing0,
    });
    const pid = exposedPortIds[0];
    if (pid === undefined) throw new Error("port");

    const forBob = await getBindablePortsForParty(alice.id, client, timing0);
    expect(forBob.some((e) => e.portId === pid)).toBe(true);
    const forAlice = await getBindablePortsForParty(bob.id, client, timing0);
    expect(forAlice.some((e) => e.portId === pid)).toBe(false);
  });

  test("nbcNaturalStop after empty turn with no bindables", async () => {
    const client = new ObpPersistenceClient(new InMemoryStrategy());
    const { party } = await client.registerParty({ name: "Solo", sourcemaps: [] });
    const body = parseNbcTurnBody({
      offer: { id: "", expires_turn: 100, expires_at_relay_ms: 0, type: "step", sourcemaps: [] },
      ports: [],
      bind_port_id: "",
      bind_payload: null,
    });
    await applyNbcTurn({ partyId: party.id, body, client, timing: timing0 });
    expect(await isSessionAdvanceable(client, timing0)).toBe(false);
    expect(await nbcNaturalStop(0, client, timing0)).toBe(true);
  });
});
