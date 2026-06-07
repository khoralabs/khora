import type { Database, Statement } from "bun:sqlite";
import { ObpError } from "@khoralabs/obp-errors";
import type { JsonDocument, Offer, Party, Port } from "@khoralabs/obp-model";
import type {
  BindPortInput,
  BindPortOutput,
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
  SetOfferExpiredNowInput,
  SetOfferExpiredNowOutput,
  SetPortExpiredNowInput,
  SetPortExpiredNowOutput,
} from "@khoralabs/obp-persistence";

type PartyRow = {
  id: string;
  created_seq: number;
  name: string;
};

type OfferRow = {
  id: string;
  created_seq: number;
  nbc_expires_turn: number;
  nbc_expires_at_relay_ms: number;
  type: string;
};

type PortRow = {
  id: string;
  created_seq: number;
  nbc_expires_turn: number;
  nbc_expires_at_relay_ms: number;
  type: string;
  promise: string | null;
  max_bindings: number;
  terminal: number;
  ref: string;
  ttl_basis: string | null;
  ttl_measure: number | null;
  expose_seq: number | null;
  bind_policy_json: string | null;
};

function rowToPartyV2(r: PartyRow): Party {
  return {
    id: r.id,
    name: r.name,
  };
}

function rowToOfferV2(r: OfferRow): Offer {
  return {
    id: r.id,
    type: r.type,
  };
}

function rowToPortV2(r: PortRow): Port {
  return {
    id: r.id,
    type: r.type,
    promise: r.promise ?? "",
    ref: r.ref ?? "",
  };
}

function stringifyCounterpartyBind(payload: JsonDocument): string | null {
  if (payload === null) return null;
  return JSON.stringify(payload);
}

function parseJsonDocument(raw: string | null): JsonDocument {
  if (raw === null || raw === "") return null;
  try {
    return JSON.parse(raw) as JsonDocument;
  } catch {
    return null;
  }
}

/** Follow `Port.ref` until empty ref (canonical). Detects cycles and missing ids. */
function resolveCanonicalPortId(
  portsById: ReadonlyMap<string, Port>,
  startPortId: string,
):
  | { ok: true }
  | { ok: false; reason: "cycle"; path: readonly string[] }
  | {
      ok: false;
      reason: "missing";
      missingId: string;
      path: readonly string[];
    } {
  const path: string[] = [];
  const visited = new Set<string>();
  let current = startPortId;

  for (;;) {
    if (visited.has(current)) {
      return { ok: false, reason: "cycle", path };
    }
    visited.add(current);
    path.push(current);

    const port = portsById.get(current);
    if (!port) {
      return { ok: false, reason: "missing", missingId: current, path };
    }

    const next = port.ref.trim();
    if (next === "") {
      return { ok: true };
    }
    current = next;
  }
}

export class SqliteObpPersistenceStrategy implements ObpPersistenceStrategy {
  private readonly insertParty: Statement;
  private readonly updatePortExpiresNow: Statement;
  private readonly updateOfferExpiresNow: Statement;
  private readonly updatePortsExpiresNowForOffer: Statement;
  private readonly insertOffer: Statement;
  private readonly insertExtend: Statement;
  private readonly insertBind: Statement;
  private readonly insertPort: Statement;
  private readonly insertExpose: Statement;

  constructor(private readonly db: Database) {
    this.insertParty = db.prepare(
      `INSERT INTO obp_parties (id, created_seq, name) VALUES (?, ?, ?)`,
    );
    this.updatePortExpiresNow = db.prepare(
      `UPDATE obp_ports SET nbc_expires_turn = ?, nbc_expires_at_relay_ms = ? WHERE id = ?`,
    );
    this.updateOfferExpiresNow = db.prepare(
      `UPDATE obp_offers SET nbc_expires_turn = ?, nbc_expires_at_relay_ms = ? WHERE id = ?`,
    );
    this.updatePortsExpiresNowForOffer = db.prepare(
      `UPDATE obp_ports SET nbc_expires_turn = ?, nbc_expires_at_relay_ms = ? WHERE id IN (SELECT port_id FROM obp_exposes WHERE offer_id = ?)`,
    );
    this.insertOffer = db.prepare(
      `INSERT INTO obp_offers (id, created_seq, nbc_expires_turn, nbc_expires_at_relay_ms, type) VALUES (?, ?, ?, ?, ?)`,
    );
    this.insertExtend = db.prepare(
      `INSERT INTO obp_extends (edge_id, party_id, offer_id, created_seq) VALUES (?, ?, ?, ?)`,
    );
    this.insertBind = db.prepare(
      `INSERT INTO obp_binds (edge_id, offer_id, port_id, created_seq, counterparty_bind_json) VALUES (?, ?, ?, ?, ?)`,
    );
    this.insertPort = db.prepare(
      `INSERT INTO obp_ports (id, created_seq, nbc_expires_turn, nbc_expires_at_relay_ms, type, promise, max_bindings, terminal, ref, ttl_basis, ttl_measure, expose_seq, bind_policy_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.insertExpose = db.prepare(
      `INSERT INTO obp_exposes (edge_id, offer_id, port_id, created_seq) VALUES (?, ?, ?, ?)`,
    );
  }

  async registerParty(input: RegisterPartyInput): Promise<RegisterPartyOutput> {
    return this.db.transaction(() => {
      const id = crypto.randomUUID();
      const seq = Date.now();
      this.insertParty.run(id, seq, input.name);
      return {
        party: rowToPartyV2({
          id,
          created_seq: seq,
          name: input.name,
        }),
      };
    })();
  }

  async getParty(input: GetPartyInput): Promise<GetPartyOutput> {
    const row = this.db
      .query<PartyRow, [string]>(`SELECT id, created_seq, name FROM obp_parties WHERE id = ?`)
      .get(input.id);
    if (!row) return { result: { kind: "notFound" } };
    return { result: { kind: "party", party: rowToPartyV2(row) } };
  }

  async getOffer(input: GetOfferInput): Promise<GetOfferOutput> {
    const row = this.db
      .query<OfferRow, [string]>(
        `SELECT id, created_seq, nbc_expires_turn, nbc_expires_at_relay_ms, type FROM obp_offers WHERE id = ?`,
      )
      .get(input.id);
    if (!row) return { result: { kind: "notFound" } };
    return { result: { kind: "offer", offer: rowToOfferV2(row) } };
  }

  async getPort(input: GetPortInput): Promise<GetPortOutput> {
    const row = this.db
      .query<PortRow, [string]>(
        `SELECT id, created_seq, nbc_expires_turn, nbc_expires_at_relay_ms, type, promise, max_bindings, terminal, ref, ttl_basis, ttl_measure, expose_seq, bind_policy_json FROM obp_ports WHERE id = ?`,
      )
      .get(input.id);
    if (!row) return { result: { kind: "notFound" } };
    return { result: { kind: "port", port: rowToPortV2(row) } };
  }

  async getPortBindPolicy(input: GetPortBindPolicyInput): Promise<GetPortBindPolicyOutput> {
    const row = this.db
      .query<{ bind_policy_json: string | null }, [string]>(
        `SELECT bind_policy_json FROM obp_ports WHERE id = ?`,
      )
      .get(input.portId);
    if (!row) return { result: { kind: "notFound" } };
    return {
      result: {
        kind: "found",
        bind_policy: parseJsonDocument(row.bind_policy_json),
      },
    };
  }

  async extendOffer(input: ExtendOfferInput): Promise<ExtendOfferOutput> {
    return this.db.transaction(() => {
      const partyExists = this.db
        .query<{ one: number }, [string]>(`SELECT 1 AS one FROM obp_parties WHERE id = ?`)
        .get(input.partyId);
      if (!partyExists) {
        throw new ObpError("NOT_FOUND", `Party not found: ${input.partyId}`);
      }

      const offerId = input.offer.id.trim() !== "" ? input.offer.id : crypto.randomUUID();
      const seq = Date.now();
      const offer: Offer = {
        ...input.offer,
        id: offerId,
      };
      const nbcT = input.nbc_expires_turn ?? 0;
      const nbcM = input.nbc_expires_at_relay_ms ?? 0;
      this.insertOffer.run(offer.id, seq, nbcT, nbcM, offer.type);

      const extId = crypto.randomUUID();
      this.insertExtend.run(extId, input.partyId, offer.id, seq);

      const bindPortId = input.bindPortId.trim();
      if (bindPortId !== "") {
        const portRow = this.db
          .query<PortRow, [string]>(
            `SELECT id, created_seq, nbc_expires_turn, nbc_expires_at_relay_ms, type, promise, max_bindings, terminal, ref, ttl_basis, ttl_measure, expose_seq, bind_policy_json FROM obp_ports WHERE id = ?`,
          )
          .get(bindPortId);
        if (!portRow) {
          throw new ObpError("NOT_FOUND", `Port not found: ${bindPortId}`);
        }
        const bindEdge = crypto.randomUUID();
        const cbJson = stringifyCounterpartyBind(input.bind_payload);
        this.insertBind.run(bindEdge, offer.id, bindPortId, seq, cbJson);
      }

      return { offer };
    })();
  }

  async exposePort(input: ExposePortInput): Promise<ExposePortOutput> {
    return this.db.transaction(() => {
      const offerExists = this.db
        .query<{ one: number }, [string]>(`SELECT 1 AS one FROM obp_offers WHERE id = ?`)
        .get(input.offerId);
      if (!offerExists) {
        throw new ObpError("NOT_FOUND", `Offer not found: ${input.offerId}`);
      }

      const portId = input.port.id.trim() !== "" ? input.port.id : crypto.randomUUID();
      const seq = Date.now();
      const port: Port = {
        ...input.port,
        id: portId,
      };

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

      const nbcT = input.nbc_expires_turn ?? 0;
      const nbcM = input.nbc_expires_at_relay_ms ?? 0;
      const bindPolicyJson = stringifyCounterpartyBind(input.bind_policy ?? null);
      this.insertPort.run(
        port.id,
        seq,
        nbcT,
        nbcM,
        port.type,
        port.promise,
        0,
        0,
        port.ref,
        null,
        null,
        null,
        bindPolicyJson,
      );

      const exId = crypto.randomUUID();
      this.insertExpose.run(exId, input.offerId, port.id, seq);

      return { port };
    })();
  }

  async bindPort(input: BindPortInput): Promise<BindPortOutput> {
    return this.db.transaction(() => {
      const offerRes = this.db
        .query<OfferRow, [string]>(
          `SELECT id, created_seq, nbc_expires_turn, nbc_expires_at_relay_ms, type FROM obp_offers WHERE id = ?`,
        )
        .get(input.offerId);
      if (!offerRes) {
        throw new ObpError("NOT_FOUND", `Offer not found: ${input.offerId}`);
      }

      const portRow = this.db
        .query<PortRow, [string]>(
          `SELECT id, created_seq, nbc_expires_turn, nbc_expires_at_relay_ms, type, promise, max_bindings, terminal, ref, ttl_basis, ttl_measure, expose_seq, bind_policy_json FROM obp_ports WHERE id = ?`,
        )
        .get(input.portId);
      if (!portRow) {
        throw new ObpError("NOT_FOUND", `Port not found: ${input.portId}`);
      }

      const seq = Date.now();
      const bindEdge = crypto.randomUUID();
      const cbJson = stringifyCounterpartyBind(input.bind_payload);
      try {
        this.insertBind.run(bindEdge, input.offerId, input.portId, seq, cbJson);
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
      return {};
    })();
  }

  async listExposedPortEdges(
    _input: ListExposedPortEdgesInput,
  ): Promise<ListExposedPortEdgesOutput> {
    const rows = this.db
      .query<{ offer_id: string; port_id: string }, []>(`SELECT offer_id, port_id FROM obp_exposes`)
      .all();
    return {
      edges: rows.map((r) => ({ offerId: r.offer_id, portId: r.port_id })),
    };
  }

  async isPortExposed(input: IsPortExposedInput): Promise<IsPortExposedOutput> {
    const row = this.db
      .query<{ one: number }, [string]>(
        `SELECT 1 AS one FROM obp_exposes WHERE port_id = ? LIMIT 1`,
      )
      .get(input.portId);
    return { exposed: row !== null };
  }

  async listBinds(_input: ListBindsInput): Promise<ListBindsOutput> {
    const rows = this.db
      .query<
        {
          offer_id: string;
          port_id: string;
          counterparty_bind_json: string | null;
        },
        []
      >(`SELECT offer_id, port_id, counterparty_bind_json FROM obp_binds`)
      .all();
    return {
      binds: rows.map((r) => ({
        offerId: r.offer_id,
        portId: r.port_id,
        bind_payload: parseJsonDocument(r.counterparty_bind_json),
      })),
    };
  }

  async getPortsSnapshot(_input: GetPortsSnapshotInput): Promise<GetPortsSnapshotOutput> {
    const entries = [...this.loadPortsMap().entries()].map(([portId, port]) => ({ portId, port }));
    return { entries };
  }

  async getExtendingPartyId(input: GetExtendingPartyIdInput): Promise<GetExtendingPartyIdOutput> {
    const row = this.db
      .query<{ party_id: string }, [string]>(`SELECT party_id FROM obp_extends WHERE offer_id = ?`)
      .get(input.offerId);
    return { partyId: row?.party_id ?? "" };
  }

  async getNbcBindWindowForOffer(
    input: GetNbcBindWindowForOfferInput,
  ): Promise<GetNbcBindWindowForOfferOutput> {
    const row = this.db
      .query<{ nbc_expires_turn: number; nbc_expires_at_relay_ms: number }, [string]>(
        `SELECT nbc_expires_turn, nbc_expires_at_relay_ms FROM obp_offers WHERE id = ?`,
      )
      .get(input.offerId);
    if (!row) return { result: { kind: "notFound" } };
    return {
      result: {
        kind: "window",
        window: {
          nbc_expires_turn: row.nbc_expires_turn,
          nbc_expires_at_relay_ms: row.nbc_expires_at_relay_ms,
        },
      },
    };
  }

  async getNbcBindWindowForPort(
    input: GetNbcBindWindowForPortInput,
  ): Promise<GetNbcBindWindowForPortOutput> {
    const row = this.db
      .query<{ nbc_expires_turn: number; nbc_expires_at_relay_ms: number }, [string]>(
        `SELECT nbc_expires_turn, nbc_expires_at_relay_ms FROM obp_ports WHERE id = ?`,
      )
      .get(input.portId);
    if (!row) return { result: { kind: "notFound" } };
    return {
      result: {
        kind: "window",
        window: {
          nbc_expires_turn: row.nbc_expires_turn,
          nbc_expires_at_relay_ms: row.nbc_expires_at_relay_ms,
        },
      },
    };
  }

  async setPortExpiredNow(input: SetPortExpiredNowInput): Promise<SetPortExpiredNowOutput> {
    const row = this.db
      .query<{ one: number }, [string]>(`SELECT 1 AS one FROM obp_ports WHERE id = ?`)
      .get(input.portId);
    if (!row) {
      throw new ObpError("NOT_FOUND", `Port not found: ${input.portId}`);
    }
    this.updatePortExpiresNow.run(0, 1, input.portId);
    return {};
  }

  async setOfferExpiredNow(input: SetOfferExpiredNowInput): Promise<SetOfferExpiredNowOutput> {
    const row = this.db
      .query<{ one: number }, [string]>(`SELECT 1 AS one FROM obp_offers WHERE id = ?`)
      .get(input.offerId);
    if (!row) {
      throw new ObpError("NOT_FOUND", `Offer not found: ${input.offerId}`);
    }
    this.db.transaction(() => {
      this.updateOfferExpiresNow.run(0, 1, input.offerId);
      this.updatePortsExpiresNowForOffer.run(0, 1, input.offerId);
    })();
    return {};
  }

  private loadPortsMap(): Map<string, Port> {
    const rows = this.db
      .query<PortRow, []>(
        `SELECT id, created_seq, nbc_expires_turn, nbc_expires_at_relay_ms, type, promise, max_bindings, terminal, ref, ttl_basis, ttl_measure, expose_seq, bind_policy_json FROM obp_ports`,
      )
      .all();
    const m = new Map<string, Port>();
    for (const r of rows) {
      m.set(r.id, rowToPortV2(r));
    }
    return m;
  }
}

export function createObpV2SqliteStrategy(db: Database): SqliteObpPersistenceStrategy {
  return new SqliteObpPersistenceStrategy(db);
}
