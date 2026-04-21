import type { Database } from "bun:sqlite";
import {
  type BindPortInput,
  type BindValidationFailure,
  type ExposePortInput,
  type ExtendOfferInput,
  type GetOfferResult,
  type GetPartyResult,
  type GetPortResult,
  ObpError,
  type ObpPersistence,
  type Offer,
  type Party,
  type Port,
  type RegisterPartyInput,
  resolveCanonicalPortId,
  type SourceMapRef,
  validateBindPreconditions,
} from "@cfd/obp-core";

type PartyRow = {
  id: string;
  ts_created: number;
  name: string;
  sourcemaps_json: string;
};

type OfferRow = {
  id: string;
  ts_created: number;
  ts_expired: number;
  type: string;
  sourcemaps_json: string;
};

type PortRow = {
  id: string;
  ts_created: number;
  ts_expired: number;
  type: string;
  max_bindings: number;
  terminal: number;
  ref: string;
  sourcemaps_json: string;
};

function parseSourcemaps(json: string): SourceMapRef[] {
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    const out: SourceMapRef[] = [];
    for (const x of v) {
      if (x && typeof x === "object") {
        const r = x as Record<string, unknown>;
        if (typeof r.resource_id === "string" && typeof r.source_key === "string") {
          out.push({ resource_id: r.resource_id, source_key: r.source_key });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

function stringifySourcemaps(s: SourceMapRef[]): string {
  return JSON.stringify(s);
}

function rowToParty(r: PartyRow): Party {
  return {
    id: r.id,
    ts_created: r.ts_created,
    name: r.name,
    sourcemaps: parseSourcemaps(r.sourcemaps_json),
  };
}

function rowToOffer(r: OfferRow): Offer {
  return {
    id: r.id,
    ts_created: r.ts_created,
    ts_expired: r.ts_expired,
    type: r.type,
    sourcemaps: parseSourcemaps(r.sourcemaps_json),
  };
}

function rowToPort(r: PortRow): Port {
  return {
    id: r.id,
    ts_created: r.ts_created,
    ts_expired: r.ts_expired,
    type: r.type,
    max_bindings: r.max_bindings,
    terminal: r.terminal !== 0,
    ref: r.ref ?? "",
    sourcemaps: parseSourcemaps(r.sourcemaps_json),
  };
}

function throwBindFailure(failure: BindValidationFailure): never {
  switch (failure.code) {
    case "EXPIRED":
      throw new ObpError("EXPIRED", `Entity expired (${failure.entity})`);
    case "NOT_EXPOSED":
      throw new ObpError("NOT_EXPOSED", "Port is not exposed");
    case "REF_CYCLE":
      throw new ObpError("REF_CYCLE", `Port ref cycle: ${failure.path.join(" -> ")}`);
    case "REF_MISSING":
      throw new ObpError("REF_MISSING", `Missing port in ref chain: ${failure.missingId}`);
    case "MAX_BINDINGS":
      throw new ObpError(
        "MAX_BINDINGS",
        `max_bindings (${failure.max}) reached for canonical port ${failure.canonicalId} (current ${failure.current})`,
      );
    default: {
      const _exhaustive: never = failure;
      throw new ObpError("VALIDATION", String(_exhaustive));
    }
  }
}

export class ObpSqlitePersistence implements ObpPersistence {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = () => Date.now(),
  ) {}

  registerParty(input: RegisterPartyInput): { party: Party } {
    return this.db.transaction(() => {
      const id = crypto.randomUUID();
      const ts = this.now();
      const smJson = stringifySourcemaps(input.sourcemaps);
      this.db.run(
        `INSERT INTO obp_parties (id, ts_created, name, sourcemaps_json) VALUES (?, ?, ?, ?)`,
        [id, ts, input.name, smJson],
      );
      return {
        party: {
          id,
          ts_created: ts,
          name: input.name,
          sourcemaps: parseSourcemaps(smJson),
        },
      };
    })();
  }

  getParty(id: string): GetPartyResult {
    const row = this.db
      .query<PartyRow, [string]>(
        `SELECT id, ts_created, name, sourcemaps_json FROM obp_parties WHERE id = ?`,
      )
      .get(id);
    if (!row) return { kind: "notFound" };
    return { kind: "found", party: rowToParty(row) };
  }

  getOffer(id: string): GetOfferResult {
    const row = this.db
      .query<OfferRow, [string]>(
        `SELECT id, ts_created, ts_expired, type, sourcemaps_json FROM obp_offers WHERE id = ?`,
      )
      .get(id);
    if (!row) return { kind: "notFound" };
    return { kind: "found", offer: rowToOffer(row) };
  }

  getPort(id: string): GetPortResult {
    const row = this.db
      .query<PortRow, [string]>(
        `SELECT id, ts_created, ts_expired, type, max_bindings, terminal, ref, sourcemaps_json FROM obp_ports WHERE id = ?`,
      )
      .get(id);
    if (!row) return { kind: "notFound" };
    return { kind: "found", port: rowToPort(row) };
  }

  getExtendingPartyId(offerId: string): string | null {
    const row = this.db
      .query<{ party_id: string }, [string]>(`SELECT party_id FROM obp_extends WHERE offer_id = ?`)
      .get(offerId);
    return row?.party_id ?? null;
  }

  listExposedPortEdges(): ReadonlyArray<{ offerId: string; portId: string }> {
    const rows = this.db
      .query<{ offer_id: string; port_id: string }, []>(
        `SELECT offer_id, port_id FROM obp_exposes`,
      )
      .all();
    return rows.map((r) => ({ offerId: r.offer_id, portId: r.port_id }));
  }

  setPortExpiredNow(portId: string): void {
    const pr = this.getPort(portId);
    if (pr.kind === "notFound") {
      throw new ObpError("NOT_FOUND", `Port not found: ${portId}`);
    }
    const ts = this.now();
    this.db.run(`UPDATE obp_ports SET ts_expired = ? WHERE id = ?`, [ts, portId]);
  }

  setOfferExpiredNow(offerId: string): void {
    const or = this.getOffer(offerId);
    if (or.kind === "notFound") {
      throw new ObpError("NOT_FOUND", `Offer not found: ${offerId}`);
    }
    this.db.transaction(() => {
      const ts = this.now();
      this.db.run(`UPDATE obp_offers SET ts_expired = ? WHERE id = ?`, [ts, offerId]);
      this.db.run(
        `UPDATE obp_ports SET ts_expired = ? WHERE id IN (SELECT port_id FROM obp_exposes WHERE offer_id = ?)`,
        [ts, offerId],
      );
    })();
  }

  extendOffer(input: ExtendOfferInput): { offer: Offer } {
    return this.db.transaction(() => {
      const partyExists = this.db
        .query<{ one: number }, [string]>(`SELECT 1 AS one FROM obp_parties WHERE id = ?`)
        .get(input.partyId);
      if (!partyExists) {
        throw new ObpError("NOT_FOUND", `Party not found: ${input.partyId}`);
      }

      const offerId = input.offer.id.trim() !== "" ? input.offer.id : crypto.randomUUID();
      const ts = this.now();
      const offer: Offer = {
        ...input.offer,
        id: offerId,
        ts_created: ts,
      };
      const smJson = stringifySourcemaps(offer.sourcemaps);
      this.db.run(
        `INSERT INTO obp_offers (id, ts_created, ts_expired, type, sourcemaps_json) VALUES (?, ?, ?, ?, ?)`,
        [offer.id, offer.ts_created, offer.ts_expired, offer.type, smJson],
      );

      const extId = crypto.randomUUID();
      this.db.run(
        `INSERT INTO obp_extends (edge_id, party_id, offer_id, ts_created, sourcemaps_json) VALUES (?, ?, ?, ?, ?)`,
        [extId, input.partyId, offer.id, ts, "[]"],
      );

      const bindPortId = input.bindPortId.trim();
      if (bindPortId !== "") {
        const portRow = this.db
          .query<PortRow, [string]>(
            `SELECT id, ts_created, ts_expired, type, max_bindings, terminal, ref, sourcemaps_json FROM obp_ports WHERE id = ?`,
          )
          .get(bindPortId);
        if (!portRow) {
          throw new ObpError("NOT_FOUND", `Port not found: ${bindPortId}`);
        }
        const port = rowToPort(portRow);
        const fail = validateBindPreconditions({
          now: this.now(),
          offer,
          port,
          portsById: this.loadPortsMap(),
          targetPortIsExposed: this.isPortExposed(bindPortId),
          binds: this.listBinds(),
        });
        if (fail !== null) {
          throwBindFailure(fail);
        }
        const bindEdge = crypto.randomUUID();
        this.db.run(
          `INSERT INTO obp_binds (edge_id, offer_id, port_id, ts_created, sourcemaps_json) VALUES (?, ?, ?, ?, ?)`,
          [bindEdge, offer.id, bindPortId, ts, "[]"],
        );
      }

      return { offer };
    })();
  }

  exposePort(input: ExposePortInput): { port: Port } {
    return this.db.transaction(() => {
      const offerExists = this.db
        .query<{ one: number }, [string]>(`SELECT 1 AS one FROM obp_offers WHERE id = ?`)
        .get(input.offerId);
      if (!offerExists) {
        throw new ObpError("NOT_FOUND", `Offer not found: ${input.offerId}`);
      }
      if (input.port.max_bindings < 0) {
        throw new ObpError("VALIDATION", "max_bindings must be non-negative");
      }

      const portId = input.port.id.trim() !== "" ? input.port.id : crypto.randomUUID();
      const ts = this.now();
      const port: Port = {
        ...input.port,
        id: portId,
        ts_created: ts,
      };
      const smJson = stringifySourcemaps(port.sourcemaps);

      const map = this.loadPortsMap();
      map.set(port.id, port);
      const refTrim = port.ref.trim();
      if (refTrim !== "" && !map.has(refTrim)) {
        throw new ObpError("REF_MISSING", `Port ref target not found: ${refTrim}`);
      }

      const resolved = resolveCanonicalPortId(map, port.id);
      if (!resolved.ok) {
        if (resolved.reason === "cycle") {
          throw new ObpError("REF_CYCLE", `Port ref cycle: ${resolved.path.join(" -> ")}`);
        }
        throw new ObpError("REF_MISSING", `Missing port in ref chain: ${resolved.missingId}`);
      }

      this.db.run(
        `INSERT INTO obp_ports (id, ts_created, ts_expired, type, max_bindings, terminal, ref, sourcemaps_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          port.id,
          port.ts_created,
          port.ts_expired,
          port.type,
          port.max_bindings,
          port.terminal ? 1 : 0,
          port.ref,
          smJson,
        ],
      );

      const exId = crypto.randomUUID();
      this.db.run(
        `INSERT INTO obp_exposes (edge_id, offer_id, port_id, ts_created, sourcemaps_json) VALUES (?, ?, ?, ?, ?)`,
        [exId, input.offerId, port.id, ts, "[]"],
      );

      return { port };
    })();
  }

  bindPort(input: BindPortInput): void {
    this.db.transaction(() => {
      const offerRes = this.getOffer(input.offerId);
      if (offerRes.kind === "notFound") {
        throw new ObpError("NOT_FOUND", `Offer not found: ${input.offerId}`);
      }
      const portRes = this.getPort(input.portId);
      if (portRes.kind === "notFound") {
        throw new ObpError("NOT_FOUND", `Port not found: ${input.portId}`);
      }

      const fail = validateBindPreconditions({
        now: this.now(),
        offer: offerRes.offer,
        port: portRes.port,
        portsById: this.loadPortsMap(),
        targetPortIsExposed: this.isPortExposed(input.portId),
        binds: this.listBinds(),
      });
      if (fail !== null) {
        throwBindFailure(fail);
      }

      const ts = this.now();
      const bindEdge = crypto.randomUUID();
      try {
        this.db.run(
          `INSERT INTO obp_binds (edge_id, offer_id, port_id, ts_created, sourcemaps_json) VALUES (?, ?, ?, ?, ?)`,
          [bindEdge, input.offerId, input.portId, ts, "[]"],
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE") || msg.includes("unique")) {
          throw new ObpError(
            "VALIDATION",
            `Duplicate bind for offer ${input.offerId} and port ${input.portId}`,
          );
        }
        throw e;
      }
    })();
  }

  isPortExposed(portId: string): boolean {
    const row = this.db
      .query<{ one: number }, [string]>(
        `SELECT 1 AS one FROM obp_exposes WHERE port_id = ? LIMIT 1`,
      )
      .get(portId);
    return row !== null;
  }

  listBinds(): ReadonlyArray<{ offerId: string; portId: string }> {
    const rows = this.db
      .query<{ offer_id: string; port_id: string }, []>(`SELECT offer_id, port_id FROM obp_binds`)
      .all();
    return rows.map((r) => ({ offerId: r.offer_id, portId: r.port_id }));
  }

  getPortsSnapshot(): ReadonlyMap<string, Port> {
    return this.loadPortsMap();
  }

  private loadPortsMap(): Map<string, Port> {
    const rows = this.db
      .query<PortRow, []>(
        `SELECT id, ts_created, ts_expired, type, max_bindings, terminal, ref, sourcemaps_json FROM obp_ports`,
      )
      .all();
    const m = new Map<string, Port>();
    for (const r of rows) {
      m.set(r.id, rowToPort(r));
    }
    return m;
  }
}

export function createObpSqlitePersistence(
  db: Database,
  options?: { now?: () => number },
): ObpPersistence {
  return new ObpSqlitePersistence(db, options?.now);
}
