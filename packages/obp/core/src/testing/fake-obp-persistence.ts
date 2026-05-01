import type { PortBindPolicy } from "../bind-policy/types.ts";
import type {
  BindPortInput,
  BindsEdge,
  ExposePortInput,
  ExposesEdge,
  ExtendOfferInput,
  ExtendsEdge,
  GetOfferResult,
  GetPartyResult,
  GetPortResult,
  Offer,
  Party,
  Port,
  RegisterPartyInput,
} from "../model/types";
import type { ObpPersistence } from "../persistence-types";

type BindRow = {
  offerId: string;
  portId: string;
  edge: BindsEdge;
  counterparty_bind?: Record<string, unknown>;
  bind_policy?: PortBindPolicy;
};
type ExposeRow = { offerId: string; portId: string; edge: ExposesEdge };
type ExtendRow = { partyId: string; offerId: string; edge: ExtendsEdge };

/**
 * In-memory {@link ObpPersistence} for tests — not a production storage strategy.
 */
export class FakeObpPersistence implements ObpPersistence {
  readonly parties = new Map<string, Party>();
  readonly offers = new Map<string, Offer>();
  readonly ports = new Map<string, Port>();
  private readonly extendsRows: ExtendRow[] = [];
  private readonly exposesRows: ExposeRow[] = [];
  private readonly bindRows: BindRow[] = [];

  constructor(private readonly clock: () => number = () => Date.now()) {}

  registerParty(input: RegisterPartyInput): { party: Party } {
    const now = this.clock();
    const party: Party = {
      id: crypto.randomUUID(),
      ts_created: now,
      name: input.name,
      sourcemaps: [...input.sourcemaps],
    };
    this.parties.set(party.id, party);
    return { party };
  }

  getParty(id: string): GetPartyResult {
    const party = this.parties.get(id);
    if (!party) return { kind: "notFound" };
    return { kind: "found", party };
  }

  getOffer(id: string): GetOfferResult {
    const offer = this.offers.get(id);
    if (!offer) return { kind: "notFound" };
    return { kind: "found", offer };
  }

  getPort(id: string): GetPortResult {
    const port = this.ports.get(id);
    if (!port) return { kind: "notFound" };
    return { kind: "found", port };
  }

  extendOffer(input: ExtendOfferInput): { offer: Offer } {
    const party = this.parties.get(input.partyId);
    if (!party) {
      throw new Error(`FakeObpPersistence: party not found: ${input.partyId}`);
    }
    const now = this.clock();
    const id = input.offer.id.trim() !== "" ? input.offer.id : crypto.randomUUID();
    const offer: Offer = {
      ...input.offer,
      id,
      ts_created: now,
    };
    this.offers.set(id, offer);
    this.extendsRows.push({
      partyId: input.partyId,
      offerId: id,
      edge: { id: crypto.randomUUID(), ts_created: now, sourcemaps: [] },
    });
    const bindPortId = input.bindPortId.trim();
    if (bindPortId !== "") {
      const counterparty_bind =
        input.counterparty_bind !== undefined && Object.keys(input.counterparty_bind).length > 0
          ? input.counterparty_bind
          : undefined;
      const portEntity = this.ports.get(bindPortId);
      const bind_policy = portEntity?.bind_policy;
      this.bindRows.push({
        offerId: id,
        portId: bindPortId,
        edge: { id: crypto.randomUUID(), ts_created: now, sourcemaps: [] },
        ...(counterparty_bind !== undefined ? { counterparty_bind } : {}),
        ...(bind_policy !== undefined ? { bind_policy } : {}),
      });
    }
    return { offer };
  }

  exposePort(input: ExposePortInput): { port: Port } {
    if (!this.offers.has(input.offerId)) {
      throw new Error(`FakeObpPersistence: offer not found: ${input.offerId}`);
    }
    const now = this.clock();
    const id = input.port.id.trim() !== "" ? input.port.id : crypto.randomUUID();
    const port: Port = {
      ...input.port,
      id,
      ts_created: now,
    };
    this.ports.set(id, port);
    this.exposesRows.push({
      offerId: input.offerId,
      portId: id,
      edge: { id: crypto.randomUUID(), ts_created: now, sourcemaps: [] },
    });
    return { port };
  }

  bindPort(input: BindPortInput): void {
    if (!this.offers.has(input.offerId)) {
      throw new Error(`FakeObpPersistence: offer not found: ${input.offerId}`);
    }
    if (!this.ports.has(input.portId)) {
      throw new Error(`FakeObpPersistence: port not found: ${input.portId}`);
    }
    const now = this.clock();
    const counterparty_bind =
      input.counterparty_bind !== undefined && Object.keys(input.counterparty_bind).length > 0
        ? input.counterparty_bind
        : undefined;
    this.bindRows.push({
      offerId: input.offerId,
      portId: input.portId,
      edge: { id: crypto.randomUUID(), ts_created: now, sourcemaps: [] },
      ...(counterparty_bind !== undefined ? { counterparty_bind } : {}),
    });
  }

  isPortExposed(portId: string): boolean {
    return this.exposesRows.some((r) => r.portId === portId);
  }

  listBinds(): ReadonlyArray<{
    offerId: string;
    portId: string;
    counterparty_bind?: Record<string, unknown>;
    bind_policy?: PortBindPolicy;
  }> {
    return this.bindRows.map((b) => ({
      offerId: b.offerId,
      portId: b.portId,
      ...(b.counterparty_bind !== undefined ? { counterparty_bind: b.counterparty_bind } : {}),
      ...(b.bind_policy !== undefined ? { bind_policy: b.bind_policy } : {}),
    }));
  }

  getPortsSnapshot(): ReadonlyMap<string, Port> {
    return new Map(this.ports);
  }

  getExtendingPartyId(offerId: string): string | null {
    const row = this.extendsRows.find((r) => r.offerId === offerId);
    return row?.partyId ?? null;
  }

  listExposedPortEdges(): ReadonlyArray<{ offerId: string; portId: string }> {
    return this.exposesRows.map((r) => ({ offerId: r.offerId, portId: r.portId }));
  }

  setPortExpiredNow(portId: string): void {
    const port = this.ports.get(portId);
    if (port === undefined) {
      throw new Error(`FakeObpPersistence: port not found: ${portId}`);
    }
    const ts = this.clock();
    this.ports.set(portId, { ...port, ts_expired: ts });
  }

  setOfferExpiredNow(offerId: string): void {
    const offer = this.offers.get(offerId);
    if (offer === undefined) {
      throw new Error(`FakeObpPersistence: offer not found: ${offerId}`);
    }
    const ts = this.clock();
    this.offers.set(offerId, { ...offer, ts_expired: ts });
    for (const r of this.exposesRows) {
      if (r.offerId !== offerId) {
        continue;
      }
      const p = this.ports.get(r.portId);
      if (p !== undefined) {
        this.ports.set(r.portId, { ...p, ts_expired: ts });
      }
    }
  }

  /** Test helper: exactly one EXTENDS per offer. */
  getExtendsForOffer(offerId: string): ExtendRow | undefined {
    return this.extendsRows.find((r) => r.offerId === offerId);
  }
}
