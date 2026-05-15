import type { JsonDocument, Offer, Party, Port } from "@khoralabs/obp-v2-model";
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
  RegisterPartyInput,
  RegisterPartyOutput,
  SetOfferExpiredNowInput,
  SetOfferExpiredNowOutput,
  SetPortExpiredNowInput,
  SetPortExpiredNowOutput,
} from "./persistence-types.ts";

/** Minimal in-memory {@link ObpPersistenceStrategy} for tests and local daemons. */
export class InMemoryObpPersistenceStrategy implements ObpPersistenceStrategy {
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
  /** NBC expose-time bind_policy snapshot per port id (`null` when inactive). */
  private portBindPolicies = new Map<string, JsonDocument>();
  private binds: BindListingRow[] = [];
  private seq = 0n;
  private nextId(): string {
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
    const nt = input.nbc_expires_turn ?? 0;
    const nm = input.nbc_expires_at_relay_ms ?? 0;
    this.offerNbc.set(offer.id, { nbc_expires_turn: nt, nbc_expires_at_relay_ms: nm });
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
    const nt = input.nbc_expires_turn ?? 0;
    const nm = input.nbc_expires_at_relay_ms ?? 0;
    this.portNbc.set(port.id, { nbc_expires_turn: nt, nbc_expires_at_relay_ms: nm });
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

  async setPortExpiredNow(input: SetPortExpiredNowInput): Promise<SetPortExpiredNowOutput> {
    const port = this.ports.get(input.portId);
    if (!port) return {};
    this.portNbc.set(input.portId, { nbc_expires_turn: 0, nbc_expires_at_relay_ms: 1 });
    return {};
  }

  async setOfferExpiredNow(input: SetOfferExpiredNowInput): Promise<SetOfferExpiredNowOutput> {
    const offer = this.offers.get(input.offerId);
    if (offer) {
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

export function createInMemoryObpPersistenceClient(): ObpPersistenceClient {
  return new ObpPersistenceClient(new InMemoryObpPersistenceStrategy());
}
