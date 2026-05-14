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
  private extends = new Map<string, string>();
  private exposes = new Map<string, string>();
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

  async setPortExpiredNow(input: SetPortExpiredNowInput): Promise<SetPortExpiredNowOutput> {
    const port = this.ports.get(input.portId);
    if (port) this.ports.set(port.id, { ...port, expires_seq: 0n });
    return {};
  }

  async setOfferExpiredNow(input: SetOfferExpiredNowInput): Promise<SetOfferExpiredNowOutput> {
    const offer = this.offers.get(input.offerId);
    if (offer) this.offers.set(offer.id, { ...offer, expires_seq: 0n });
    return {};
  }
}

export function createInMemoryObpPersistenceClient(): ObpPersistenceClient {
  return new ObpPersistenceClient(new InMemoryObpPersistenceStrategy());
}
