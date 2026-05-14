/**
 * TypeScript models for **`cfd.obp.nbc`** turn payloads — see
 * `packages/obp/v2/nbc/spec/model/nbc-turn.smithy`.
 */

import type { JsonDocument, Offer, Port } from "@khoralabs/obp-v2-model";

/** Service version from `NbcNegotiationProtocol` in Smithy. */
export const NBC_NEGOTIATION_PROTOCOL_VERSION = "2026-05-14" as const;

/** Affordance spec in an NBC TURN (maps to `ExposePort` + thin `cfd.obp#Port`). */
export type NbcPortSpec = {
  id: string;
  type: string;
  promise: string;
  expires_seq: bigint;
  bind_policy: JsonDocument | null;
  ref: string;
};

/** Canonical `Frame.body` for bilateral NBC TURN frames. */
export type NbcTurnBody = {
  offer: Offer;
  ports: readonly NbcPortSpec[];
  bind_port_id: string;
  counterparty_bind: JsonDocument | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function toBigint(v: unknown, field: string): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isInteger(v)) return BigInt(v);
  if (typeof v === "string" && v.trim() !== "" && /^-?\d+$/.test(v.trim())) return BigInt(v.trim());
  throw new TypeError(`${field}: expected integer as bigint, number, or decimal string`);
}

function parseSourceMapRefList(v: unknown): Offer["sourcemaps"] {
  if (!Array.isArray(v)) return [];
  const out: { resource_id: string; source_key: string }[] = [];
  for (const el of v) {
    if (!isRecord(el)) continue;
    const resource_id = el.resource_id;
    const source_key = el.source_key;
    if (typeof resource_id !== "string" || typeof source_key !== "string") continue;
    out.push({ resource_id, source_key });
  }
  return out;
}

function parseOffer(v: unknown): Offer {
  if (!isRecord(v)) throw new TypeError("offer: expected object");
  const id = v.id;
  const type = v.type;
  if (typeof id !== "string") throw new TypeError("offer.id: expected string");
  if (typeof type !== "string") throw new TypeError("offer.type: expected string");
  const expires_seq = toBigint(v.expires_seq, "offer.expires_seq");
  const sourcemaps = parseSourceMapRefList(v.sourcemaps);
  return { id, type, expires_seq, sourcemaps };
}

function parseNbcPortSpec(v: unknown): NbcPortSpec {
  if (!isRecord(v)) throw new TypeError("port spec: expected object");
  const id = v.id;
  const type = v.type;
  if (typeof id !== "string") throw new TypeError("NbcPortSpec.id: expected string");
  if (typeof type !== "string") throw new TypeError("NbcPortSpec.type: expected string");
  const promise = typeof v.promise === "string" ? v.promise : "";
  const expires_seq = toBigint(v.expires_seq, "NbcPortSpec.expires_seq");
  const ref = typeof v.ref === "string" ? v.ref : "";
  let bind_policy: JsonDocument | null = null;
  if ("bind_policy" in v) {
    const bp = v.bind_policy;
    if (bp === undefined || bp === null) bind_policy = null;
    else bind_policy = bp as JsonDocument;
  }
  return { id, type, promise, expires_seq, bind_policy, ref };
}

/**
 * Runtime parse of `Frame.body` / `JsonDocument` into **`NbcTurnBody`**.
 * @throws TypeError on invalid shape
 */
export function parseNbcTurnBody(v: unknown): NbcTurnBody {
  if (!isRecord(v)) throw new TypeError("NbcTurnBody: expected object");
  const offer = parseOffer(v.offer);
  const portsRaw = v.ports;
  if (!Array.isArray(portsRaw)) throw new TypeError("ports: expected array");
  const ports = portsRaw.map(parseNbcPortSpec);
  const bind_port_id = typeof v.bind_port_id === "string" ? v.bind_port_id : "";
  let counterparty_bind: JsonDocument | null = null;
  if ("counterparty_bind" in v) {
    const cb = v.counterparty_bind;
    if (cb === undefined || cb === null) counterparty_bind = null;
    else counterparty_bind = cb as JsonDocument;
  }
  return { offer, ports, bind_port_id, counterparty_bind };
}

export function isNbcTurnBody(v: unknown): v is NbcTurnBody {
  try {
    parseNbcTurnBody(v);
    return true;
  } catch {
    return false;
  }
}

/** Map **`NbcPortSpec`** to a thin **`cfd.obp#Port`** for `ExposePort` (drops `bind_policy`). */
export function nbcPortSpecToPort(spec: NbcPortSpec): Port {
  return {
    id: spec.id,
    expires_seq: spec.expires_seq,
    type: spec.type,
    promise: spec.promise,
    ref: spec.ref,
    sourcemaps: [],
  };
}
