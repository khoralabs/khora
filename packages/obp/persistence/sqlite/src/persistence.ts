import type { Database, Statement } from "bun:sqlite";
import {
  type BindListingRow,
  type BindPortInput,
  type BindValidationFailure,
  type ContentAddressedSourceRef,
  type ExposePortInput,
  type ExtendOfferInput,
  type GetOfferResult,
  type GetPartyResult,
  type GetPortResult,
  type NegotiationPortTtlBasis,
  ObpError,
  type ObpPersistence,
  type Offer,
  type Party,
  type Port,
  type PortBindPolicy,
  portBindPolicySchema,
  type RegisterPartyInput,
  resolveCanonicalPortId,
  type SourceMapRef,
  validateBindPreconditions,
} from "@cfd/obp-core";

type PartyRow = {
  id: string;
  created_seq: number;
  name: string;
  sourcemaps_json: string;
};

type OfferRow = {
  id: string;
  created_seq: number;
  expires_seq: number;
  type: string;
  sourcemaps_json: string;
};

type PortRow = {
  id: string;
  created_seq: number;
  expires_seq: number;
  type: string;
  promise: string | null;
  max_bindings: number;
  terminal: number;
  ref: string;
  sourcemaps_json: string;
  ttl_basis: string | null;
  ttl_measure: number | null;
  expose_seq: number | null;
  bind_policy_json: string | null;
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
    created_seq: r.created_seq,
    name: r.name,
    sourcemaps: parseSourcemaps(r.sourcemaps_json),
  };
}

function rowToOffer(r: OfferRow): Offer {
  return {
    id: r.id,
    created_seq: r.created_seq,
    expires_seq: r.expires_seq,
    type: r.type,
    sourcemaps: parseSourcemaps(r.sourcemaps_json),
  };
}

function parseBindPolicyJson(raw: string | null): PortBindPolicy | undefined {
  if (raw === null || raw === "") {
    return undefined;
  }
  try {
    const v: unknown = JSON.parse(raw);
    const r = portBindPolicySchema["~standard"].validate(v);
    if (r instanceof Promise) {
      return undefined;
    }
    return r.issues ? undefined : r.value;
  } catch {
    return undefined;
  }
}

function stringifyCounterpartyBind(cb: Record<string, unknown> | undefined): string | null {
  if (cb === undefined || Object.keys(cb).length === 0) {
    return null;
  }
  return JSON.stringify(cb);
}

function parseCounterpartyBindJson(raw: string | null): Record<string, unknown> | undefined {
  if (raw === null || raw === "") {
    return undefined;
  }
  try {
    const v: unknown = JSON.parse(raw);
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function stringifyContentReceipts(receipts: ContentAddressedSourceRef[] | undefined): string {
  if (receipts === undefined || receipts.length === 0) {
    return "[]";
  }
  return JSON.stringify(receipts);
}

function parseContentReceipts(raw: string | null): ContentAddressedSourceRef[] | undefined {
  if (raw === null || raw === "" || raw === "[]") {
    return undefined;
  }
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return undefined;
    const out: ContentAddressedSourceRef[] = [];
    for (const x of v) {
      if (x !== null && typeof x === "object" && !Array.isArray(x)) {
        const r = x as Record<string, unknown>;
        if (
          typeof r.resource_id === "string" &&
          typeof r.source_key === "string" &&
          typeof r.content_sha256_hex === "string"
        ) {
          out.push({
            resource_id: r.resource_id,
            source_key: r.source_key,
            content_sha256_hex: r.content_sha256_hex,
          });
        }
      }
    }
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function parseNegotiationTtlBasis(raw: string | null): NegotiationPortTtlBasis | undefined {
  if (raw === null || raw === "") return undefined;
  switch (raw) {
    case "turns":
    case "ledger_seq":
      return raw;
    default:
      return undefined;
  }
}

function rowToPort(r: PortRow): Port {
  const port: Port = {
    id: r.id,
    created_seq: r.created_seq,
    expires_seq: r.expires_seq,
    type: r.type,
    promise: r.promise ?? "",
    max_bindings: r.max_bindings,
    terminal: r.terminal !== 0,
    ref: r.ref ?? "",
    sourcemaps: parseSourcemaps(r.sourcemaps_json),
  };
  const tb = parseNegotiationTtlBasis(r.ttl_basis);
  if (tb !== undefined && r.ttl_measure !== null && r.ttl_measure !== undefined) {
    port.ttl_basis = tb;
    port.ttl_measure = r.ttl_measure;
  }
  if (r.expose_seq !== null && r.expose_seq !== undefined) {
    port.expose_seq = r.expose_seq;
  }
  const bp = parseBindPolicyJson(r.bind_policy_json);
  if (bp !== undefined) {
    port.bind_policy = bp;
  }
  return port;
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
  private readonly insertParty: Statement;
  private readonly updatePortExpiresSeq: Statement;
  private readonly updateOfferExpiresSeq: Statement;
  private readonly updatePortsExpiresSeqForOffer: Statement;
  private readonly insertOffer: Statement;
  private readonly insertExtend: Statement;
  private readonly insertBind: Statement;
  private readonly insertPort: Statement;
  private readonly insertExpose: Statement;

  constructor(
    private readonly db: Database,
    private readonly ledgerSeq: () => number,
  ) {
    this.insertParty = db.prepare(
      `INSERT INTO obp_parties (id, created_seq, name, sourcemaps_json) VALUES (?, ?, ?, ?)`,
    );
    this.updatePortExpiresSeq = db.prepare(
      `UPDATE obp_ports SET expires_seq = ? WHERE id = ?`,
    );
    this.updateOfferExpiresSeq = db.prepare(
      `UPDATE obp_offers SET expires_seq = ? WHERE id = ?`,
    );
    this.updatePortsExpiresSeqForOffer = db.prepare(
      `UPDATE obp_ports SET expires_seq = ? WHERE id IN (SELECT port_id FROM obp_exposes WHERE offer_id = ?)`,
    );
    this.insertOffer = db.prepare(
      `INSERT INTO obp_offers (id, created_seq, expires_seq, type, sourcemaps_json) VALUES (?, ?, ?, ?, ?)`,
    );
    this.insertExtend = db.prepare(
      `INSERT INTO obp_extends (edge_id, party_id, offer_id, created_seq, sourcemaps_json) VALUES (?, ?, ?, ?, ?)`,
    );
    this.insertBind = db.prepare(
      `INSERT INTO obp_binds (edge_id, offer_id, port_id, created_seq, sourcemaps_json, counterparty_bind_json, bind_policy_json, content_receipts_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.insertPort = db.prepare(
      `INSERT INTO obp_ports (id, created_seq, expires_seq, type, promise, max_bindings, terminal, ref, sourcemaps_json, ttl_basis, ttl_measure, expose_seq, bind_policy_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.insertExpose = db.prepare(
      `INSERT INTO obp_exposes (edge_id, offer_id, port_id, created_seq, sourcemaps_json) VALUES (?, ?, ?, ?, ?)`,
    );
  }

  registerParty(input: RegisterPartyInput): { party: Party } {
    return this.db.transaction(() => {
      const id = crypto.randomUUID();
      const seq = this.ledgerSeq();
      const smJson = stringifySourcemaps(input.sourcemaps);
      this.insertParty.run(id, seq, input.name, smJson);
      return {
        party: {
          id,
          created_seq: seq,
          name: input.name,
          sourcemaps: parseSourcemaps(smJson),
        },
      };
    })();
  }

  getParty(id: string): GetPartyResult {
    const row = this.db
      .query<PartyRow, [string]>(
        `SELECT id, created_seq, name, sourcemaps_json FROM obp_parties WHERE id = ?`,
      )
      .get(id);
    if (!row) return { kind: "notFound" };
    return { kind: "found", party: rowToParty(row) };
  }

  getOffer(id: string): GetOfferResult {
    const row = this.db
      .query<OfferRow, [string]>(
        `SELECT id, created_seq, expires_seq, type, sourcemaps_json FROM obp_offers WHERE id = ?`,
      )
      .get(id);
    if (!row) return { kind: "notFound" };
    return { kind: "found", offer: rowToOffer(row) };
  }

  getPort(id: string): GetPortResult {
    const row = this.db
      .query<PortRow, [string]>(
        `SELECT id, created_seq, expires_seq, type, promise, max_bindings, terminal, ref, sourcemaps_json, ttl_basis, ttl_measure, expose_seq, bind_policy_json FROM obp_ports WHERE id = ?`,
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
      .query<{ offer_id: string; port_id: string }, []>(`SELECT offer_id, port_id FROM obp_exposes`)
      .all();
    return rows.map((r) => ({ offerId: r.offer_id, portId: r.port_id }));
  }

  setPortExpiresSeq(portId: string, expiresSeq: number): void {
    const pr = this.getPort(portId);
    if (pr.kind === "notFound") {
      throw new ObpError("NOT_FOUND", `Port not found: ${portId}`);
    }
    this.updatePortExpiresSeq.run(expiresSeq, portId);
  }

  setOfferExpiresSeq(offerId: string, expiresSeq: number): void {
    const or = this.getOffer(offerId);
    if (or.kind === "notFound") {
      throw new ObpError("NOT_FOUND", `Offer not found: ${offerId}`);
    }
    this.db.transaction(() => {
      this.updateOfferExpiresSeq.run(expiresSeq, offerId);
      this.updatePortsExpiresSeqForOffer.run(expiresSeq, offerId);
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
      const seq = this.ledgerSeq();
      const offer: Offer = {
        ...input.offer,
        id: offerId,
        created_seq: seq,
      };
      const smJson = stringifySourcemaps(offer.sourcemaps);
      this.insertOffer.run(offer.id, offer.created_seq, offer.expires_seq, offer.type, smJson);

      const extId = crypto.randomUUID();
      this.insertExtend.run(extId, input.partyId, offer.id, seq, "[]");

      const bindPortId = input.bindPortId.trim();
      if (bindPortId !== "") {
        const portRow = this.db
          .query<PortRow, [string]>(
            `SELECT id, created_seq, expires_seq, type, promise, max_bindings, terminal, ref, sourcemaps_json, ttl_basis, ttl_measure, expose_seq, bind_policy_json FROM obp_ports WHERE id = ?`,
          )
          .get(bindPortId);
        if (!portRow) {
          throw new ObpError("NOT_FOUND", `Port not found: ${bindPortId}`);
        }
        const port = rowToPort(portRow);
        const fail = validateBindPreconditions({
          ledgerSeq: this.ledgerSeq(),
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
        const cbJson = stringifyCounterpartyBind(input.counterparty_bind);
        const bindPolicyJson =
          port.bind_policy !== undefined ? JSON.stringify(port.bind_policy) : null;
        const receiptsJson = stringifyContentReceipts(input.content_receipts);
        this.insertBind.run(
          bindEdge,
          offer.id,
          bindPortId,
          seq,
          "[]",
          cbJson,
          bindPolicyJson,
          receiptsJson,
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
      const seq = this.ledgerSeq();
      const port: Port = {
        ...input.port,
        id: portId,
        created_seq: seq,
      };
      const smJson = stringifySourcemaps(port.sourcemaps);
      const ttlBasis = port.ttl_basis ?? null;
      const ttlMeasure = port.ttl_measure ?? null;
      const exposeSeq = port.expose_seq ?? null;
      const bindPolicyJson =
        port.bind_policy !== undefined ? JSON.stringify(port.bind_policy) : null;

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

      this.insertPort.run(
        port.id,
        port.created_seq,
        port.expires_seq,
        port.type,
        port.promise,
        port.max_bindings,
        port.terminal ? 1 : 0,
        port.ref,
        smJson,
        ttlBasis,
        ttlMeasure,
        exposeSeq,
        bindPolicyJson,
      );

      const exId = crypto.randomUUID();
      this.insertExpose.run(exId, input.offerId, port.id, seq, "[]");

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
        ledgerSeq: this.ledgerSeq(),
        offer: offerRes.offer,
        port: portRes.port,
        portsById: this.loadPortsMap(),
        targetPortIsExposed: this.isPortExposed(input.portId),
        binds: this.listBinds(),
      });
      if (fail !== null) {
        throwBindFailure(fail);
      }

      const seq = this.ledgerSeq();
      const bindEdge = crypto.randomUUID();
      const cbJson = stringifyCounterpartyBind(input.counterparty_bind);
      const bindPolicyJson =
        portRes.port.bind_policy !== undefined ? JSON.stringify(portRes.port.bind_policy) : null;
      const receiptsJson = stringifyContentReceipts(input.content_receipts);
      try {
        this.insertBind.run(
          bindEdge,
          input.offerId,
          input.portId,
          seq,
          "[]",
          cbJson,
          bindPolicyJson,
          receiptsJson,
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

  listBinds(): ReadonlyArray<BindListingRow> {
    const rows = this.db
      .query<
        {
          offer_id: string;
          port_id: string;
          counterparty_bind_json: string | null;
          bind_policy_json: string | null;
          content_receipts_json: string | null;
        },
        []
      >(
        `SELECT offer_id, port_id, counterparty_bind_json, bind_policy_json, content_receipts_json FROM obp_binds`,
      )
      .all();
    return rows.map((r) => {
      const cb = parseCounterpartyBindJson(r.counterparty_bind_json);
      const bp = parseBindPolicyJson(r.bind_policy_json);
      const receipts = parseContentReceipts(r.content_receipts_json);
      return {
        offerId: r.offer_id,
        portId: r.port_id,
        ...(receipts !== undefined ? { content_receipts: receipts } : {}),
        ...(cb !== undefined ? { counterparty_bind: cb } : {}),
        ...(bp !== undefined ? { bind_policy_snapshot: bp } : {}),
      };
    });
  }

  getPortsSnapshot(): ReadonlyMap<string, Port> {
    return this.loadPortsMap();
  }

  private loadPortsMap(): Map<string, Port> {
    const rows = this.db
      .query<PortRow, []>(
        `SELECT id, created_seq, expires_seq, type, promise, max_bindings, terminal, ref, sourcemaps_json, ttl_basis, ttl_measure, expose_seq, bind_policy_json FROM obp_ports`,
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
  options: { ledgerSeq: () => number },
): ObpPersistence {
  return new ObpSqlitePersistence(db, options.ledgerSeq);
}
