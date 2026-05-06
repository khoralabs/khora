import type {
  BindListingRow,
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
import type { ObpPersistence } from "../persistence/client/persistence-types.ts";

type BindRow = {
  offerId: string;
  portId: string;
  edge: BindsEdge;
};
type ExposeRow = { offerId: string; portId: string; edge: ExposesEdge };
type ExtendRow = { partyId: string; offerId: string; edge: ExtendsEdge };

/** JSON-roundtrippable snapshot for fork rollback tests (`exportState` / `importState`). */
export type FakeObpPersistenceSnapshot = {
  parties: Party[];
  offers: Offer[];
  ports: Port[];
  extendsRows: ExtendRow[];
  exposesRows: ExposeRow[];
  bindRows: BindRow[];
};

/**
 * In-memory {@link ObpPersistence} for tests — not a production storage strategy.
 * Uses {@link ledgerSeq} for **`created_seq`** on writes and **`expires_seq`** on revoke.
 */
export class FakeObpPersistence implements ObpPersistence {
  readonly parties = new Map<string, Party>();
  readonly offers = new Map<string, Offer>();
  readonly ports = new Map<string, Port>();
  private readonly extendsRows: ExtendRow[] = [];
  private readonly exposesRows: ExposeRow[] = [];
  private readonly bindRows: BindRow[] = [];

  constructor(private readonly ledgerSeq: () => number) {}

  exportState(): FakeObpPersistenceSnapshot {
    return {
      parties: [...this.parties.values()],
      offers: [...this.offers.values()],
      ports: [...this.ports.values()],
      extendsRows: this.extendsRows.map((r) => ({
        partyId: r.partyId,
        offerId: r.offerId,
        edge: { ...r.edge, sourcemaps: [...r.edge.sourcemaps] },
      })),
      exposesRows: this.exposesRows.map((r) => ({
        offerId: r.offerId,
        portId: r.portId,
        edge: { ...r.edge, sourcemaps: [...r.edge.sourcemaps] },
      })),
      bindRows: this.bindRows.map((b) => ({
        offerId: b.offerId,
        portId: b.portId,
        edge: {
          ...b.edge,
          sourcemaps: [...b.edge.sourcemaps],
          content_receipts: [...(b.edge.content_receipts ?? [])],
          ...(b.edge.counterparty_bind !== undefined
            ? { counterparty_bind: { ...b.edge.counterparty_bind } }
            : {}),
          ...(b.edge.bind_policy_snapshot !== undefined
            ? { bind_policy_snapshot: b.edge.bind_policy_snapshot }
            : {}),
        },
      })),
    };
  }

  importState(snapshot: FakeObpPersistenceSnapshot): void {
    this.parties.clear();
    this.offers.clear();
    this.ports.clear();
    this.extendsRows.length = 0;
    this.exposesRows.length = 0;
    this.bindRows.length = 0;
    for (const p of snapshot.parties) {
      this.parties.set(p.id, { ...p, sourcemaps: [...p.sourcemaps] });
    }
    for (const o of snapshot.offers) {
      this.offers.set(o.id, { ...o, sourcemaps: [...o.sourcemaps] });
    }
    for (const p of snapshot.ports) {
      const port = { ...p, sourcemaps: [...p.sourcemaps] };
      if (port.bind_policy !== undefined) {
        port.bind_policy = structuredClone(port.bind_policy);
      }
      this.ports.set(p.id, port);
    }
    this.extendsRows.push(...snapshot.extendsRows);
    this.exposesRows.push(...snapshot.exposesRows);
    this.bindRows.push(...snapshot.bindRows);
  }

  registerParty(input: RegisterPartyInput): { party: Party } {
    const seq = this.ledgerSeq();
    const party: Party = {
      id: crypto.randomUUID(),
      created_seq: seq,
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
    const seq = this.ledgerSeq();
    const id = input.offer.id.trim() !== "" ? input.offer.id : crypto.randomUUID();
    const offer: Offer = {
      ...input.offer,
      id,
      created_seq: seq,
    };
    this.offers.set(id, offer);
    this.extendsRows.push({
      partyId: input.partyId,
      offerId: id,
      edge: { id: crypto.randomUUID(), created_seq: seq, sourcemaps: [] },
    });
    const bindPortId = input.bindPortId.trim();
    if (bindPortId !== "") {
      const counterparty_bind =
        input.counterparty_bind !== undefined && Object.keys(input.counterparty_bind).length > 0
          ? input.counterparty_bind
          : undefined;
      const portEntity = this.ports.get(bindPortId);
      const bind_policy_snapshot = portEntity?.bind_policy;
      const edge: BindsEdge = {
        id: crypto.randomUUID(),
        created_seq: seq,
        sourcemaps: [],
        content_receipts: input.content_receipts ?? [],
        ...(counterparty_bind !== undefined ? { counterparty_bind } : {}),
        ...(bind_policy_snapshot !== undefined ? { bind_policy_snapshot } : {}),
      };
      this.bindRows.push({
        offerId: id,
        portId: bindPortId,
        edge,
      });
    }
    return { offer };
  }

  exposePort(input: ExposePortInput): { port: Port } {
    if (!this.offers.has(input.offerId)) {
      throw new Error(`FakeObpPersistence: offer not found: ${input.offerId}`);
    }
    const seq = this.ledgerSeq();
    const id = input.port.id.trim() !== "" ? input.port.id : crypto.randomUUID();
    const port: Port = {
      ...input.port,
      id,
      created_seq: seq,
    };
    this.ports.set(id, port);
    this.exposesRows.push({
      offerId: input.offerId,
      portId: id,
      edge: { id: crypto.randomUUID(), created_seq: seq, sourcemaps: [] },
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
    const seq = this.ledgerSeq();
    const counterparty_bind =
      input.counterparty_bind !== undefined && Object.keys(input.counterparty_bind).length > 0
        ? input.counterparty_bind
        : undefined;
    const portEntity = this.ports.get(input.portId);
    const bind_policy_snapshot = portEntity?.bind_policy;
    const edge: BindsEdge = {
      id: crypto.randomUUID(),
      created_seq: seq,
      sourcemaps: [],
      content_receipts: input.content_receipts ?? [],
      ...(counterparty_bind !== undefined ? { counterparty_bind } : {}),
      ...(bind_policy_snapshot !== undefined ? { bind_policy_snapshot } : {}),
    };
    this.bindRows.push({
      offerId: input.offerId,
      portId: input.portId,
      edge,
    });
  }

  isPortExposed(portId: string): boolean {
    return this.exposesRows.some((r) => r.portId === portId);
  }

  listBinds(): ReadonlyArray<BindListingRow> {
    return this.bindRows.map((b) => ({
      offerId: b.offerId,
      portId: b.portId,
      ...(b.edge.content_receipts.length > 0
        ? { content_receipts: [...b.edge.content_receipts] }
        : {}),
      ...(b.edge.counterparty_bind !== undefined
        ? { counterparty_bind: b.edge.counterparty_bind }
        : {}),
      ...(b.edge.bind_policy_snapshot !== undefined
        ? { bind_policy_snapshot: b.edge.bind_policy_snapshot }
        : {}),
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

  setPortExpiresSeq(portId: string, expiresSeq: number): void {
    const port = this.ports.get(portId);
    if (port === undefined) {
      throw new Error(`FakeObpPersistence: port not found: ${portId}`);
    }
    this.ports.set(portId, { ...port, expires_seq: expiresSeq });
  }

  setOfferExpiresSeq(offerId: string, expiresSeq: number): void {
    const offer = this.offers.get(offerId);
    if (offer === undefined) {
      throw new Error(`FakeObpPersistence: offer not found: ${offerId}`);
    }
    this.offers.set(offerId, { ...offer, expires_seq: expiresSeq });
    for (const r of this.exposesRows) {
      if (r.offerId !== offerId) {
        continue;
      }
      const p = this.ports.get(r.portId);
      if (p !== undefined) {
        this.ports.set(r.portId, { ...p, expires_seq: expiresSeq });
      }
    }
  }

  /** Test helper: exactly one EXTENDS per offer. */
  getExtendsForOffer(offerId: string): ExtendRow | undefined {
    return this.extendsRows.find((r) => r.offerId === offerId);
  }
}
