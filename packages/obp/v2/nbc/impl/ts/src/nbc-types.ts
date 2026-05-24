/**
 * TypeScript models for **`khora.obp.nbc`** turn payloads — see
 * `packages/obp/v2/nbc/spec/model/nbc-turn.smithy`.
 */

import type { JsonDocument, Port } from "@khoralabs/obp-v2-model";

/** Service version from `NbcNegotiationProtocol` in Smithy. */
export const NBC_NEGOTIATION_PROTOCOL_VERSION = "2026-05-14" as const;

/** Offer spec on an NBC TURN (bind-window + identity); maps ExtendOffer thin `offer` + NBC projection inputs. */
export type NbcOfferSpec = {
  id: string;
  type: string;
  expires_turn: number;
  expires_at_relay_ms: number;
};

/** Affordance spec in an NBC TURN (maps to `ExposePort` + thin `khora.obp#Port`). */
export type NbcPortSpec = {
  id: string;
  type: string;
  promise: string;
  expires_turn: number;
  expires_at_relay_ms: number;
  bind_policy: JsonDocument | null;
  ref: string;
};

/** Canonical `Frame.body` for bilateral NBC TURN frames. */
export type NbcTurnBody = {
  offer: NbcOfferSpec;
  ports: readonly NbcPortSpec[];
  bind_port_id: string;
  bind_payload: JsonDocument | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function toFiniteNumber(v: unknown, field: string): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  throw new TypeError(`${field}: expected finite number`);
}

function toNonnegInt(v: unknown, field: string): number {
  if (v === undefined || v === null) return 0;
  const n = toFiniteNumber(v, field);
  if (!Number.isInteger(n)) throw new TypeError(`${field}: expected integer`);
  if (n < 0) throw new TypeError(`${field}: expected non-negative integer`);
  return n;
}

function toRelayMs(v: unknown, field: string): number {
  if (v === undefined || v === null) return 0;
  const n = toFiniteNumber(v, field);
  if (!Number.isInteger(n)) throw new TypeError(`${field}: expected integer`);
  if (n < 0) throw new TypeError(`${field}: expected non-negative relay ms`);
  return n;
}

function parseNbcOfferSpec(v: unknown): NbcOfferSpec {
  if (!isRecord(v)) throw new TypeError("offer: expected object");
  const id = v.id;
  const type = v.type;
  if (typeof id !== "string") throw new TypeError("offer.id: expected string");
  if (typeof type !== "string") throw new TypeError("offer.type: expected string");
  const expires_turn = toNonnegInt(v.expires_turn, "offer.expires_turn");
  const expires_at_relay_ms = toRelayMs(v.expires_at_relay_ms, "offer.expires_at_relay_ms");
  return { id, type, expires_turn, expires_at_relay_ms };
}

function parseNbcPortSpec(v: unknown): NbcPortSpec {
  if (!isRecord(v)) throw new TypeError("port spec: expected object");
  const id = v.id;
  const rawType = v.type ?? v.portType;
  const type =
    typeof rawType === "string" && rawType.trim() !== "" ? rawType.trim() : "obp.frame.port";
  if (typeof id !== "string") throw new TypeError("NbcPortSpec.id: expected string");
  const promise = typeof v.promise === "string" ? v.promise : "";
  const expires_turn = toNonnegInt(v.expires_turn, "NbcPortSpec.expires_turn");
  const expires_at_relay_ms = toRelayMs(v.expires_at_relay_ms, "NbcPortSpec.expires_at_relay_ms");
  const ref = typeof v.ref === "string" ? v.ref : "";
  let bind_policy: JsonDocument | null = null;
  if ("bind_policy" in v) {
    const bp = v.bind_policy;
    if (bp === undefined || bp === null) bind_policy = null;
    else bind_policy = bp as JsonDocument;
  }
  return { id, type, promise, expires_turn, expires_at_relay_ms, bind_policy, ref };
}

/**
 * Runtime parse of `Frame.body` / `JsonDocument` into **`NbcTurnBody`**.
 * @throws TypeError on invalid shape
 */
export function parseNbcTurnBody(v: unknown): NbcTurnBody {
  if (!isRecord(v)) throw new TypeError("NbcTurnBody: expected object");

  let offer: NbcOfferSpec;
  if (v.offer !== undefined && v.offer !== null) {
    offer = parseNbcOfferSpec(v.offer);
  } else {
    const id = String(v.offerId ?? "");
    const type = String(v.offerType ?? "");
    const expires_turn = toNonnegInt(v.expires_turn, "expires_turn");
    const expires_at_relay_ms = toRelayMs(v.expires_at_relay_ms, "expires_at_relay_ms");
    offer = { id, type, expires_turn, expires_at_relay_ms };
  }

  const portsRaw = v.ports;
  if (!Array.isArray(portsRaw)) throw new TypeError("ports: expected array");
  const ports = portsRaw.map(parseNbcPortSpec);
  const bind_port_id =
    typeof v.bind_port_id === "string"
      ? v.bind_port_id
      : typeof v.bindPortId === "string"
        ? v.bindPortId
        : "";
  let bind_payload: JsonDocument | null = null;
  if ("bind_payload" in v) {
    const bp = v.bind_payload;
    if (bp === undefined || bp === null) bind_payload = null;
    else bind_payload = bp as JsonDocument;
  } else if ("counterparty_bind" in v) {
    const cb = v.counterparty_bind;
    if (cb === undefined || cb === null) bind_payload = null;
    else bind_payload = cb as JsonDocument;
  }
  return { offer, ports, bind_port_id, bind_payload };
}

export function isNbcTurnBody(v: unknown): v is NbcTurnBody {
  try {
    parseNbcTurnBody(v);
    return true;
  } catch {
    return false;
  }
}

/** Map **`NbcPortSpec`** to a thin **`khora.obp#Port`** for `ExposePort` (drops `bind_policy`). */
export function nbcPortSpecToPort(spec: NbcPortSpec): Port {
  return {
    id: spec.id,
    type: spec.type,
    promise: spec.promise,
    ref: spec.ref,
  };
}
