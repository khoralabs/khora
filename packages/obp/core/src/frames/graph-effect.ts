import { portBindPolicySchema } from "../bind-policy/index.ts";
import { ObpError } from "../persistence/client/errors.ts";
import type { OBPPersistenceClient } from "../persistence/client/obp-persistence-client.ts";
import type { Offer, Port } from "../model/types.ts";
import type { ProliferateBody, PortSpec, ResolveBody } from "./types.ts";

const MAX_EXPIRES = Number.MAX_SAFE_INTEGER;

function parsePortMaxBindings(o: Record<string, unknown>): number {
  if (!("max_bindings" in o) || o.max_bindings === undefined || o.max_bindings === null) {
    return 1;
  }
  const n = Number(o.max_bindings);
  if (!Number.isInteger(n) || n < 0) {
    throw new ObpError("VALIDATION", "port max_bindings must be a non-negative integer");
  }
  return n;
}

function mapPort(spec: PortSpec): Port {
  return {
    id: spec.id,
    created_seq: 0,
    expires_seq: MAX_EXPIRES,
    type: "obp.frame.port",
    promise: spec.id,
    max_bindings: spec.max_bindings ?? 1,
    terminal: spec.isTerminal,
    ref: "",
    sourcemaps: [],
    ...(spec.bind_policy != null && spec.bind_policy !== undefined
      ? { bind_policy: spec.bind_policy }
      : {}),
  };
}

export function parseProliferateBody(body: Record<string, unknown>): ProliferateBody {
  const offerId = String(body.offerId ?? "");
  const rawPorts = Array.isArray(body.ports) ? body.ports : [];
  const ports: PortSpec[] = rawPorts.map((p) => {
    const o = p as Record<string, unknown>;
    let bind_policy: PortSpec["bind_policy"];
    if (o.bind_policy != null && typeof o.bind_policy === "object") {
      const r = portBindPolicySchema["~standard"].validate(o.bind_policy);
      if (r instanceof Promise) {
        throw new TypeError("bind_policy validation must be synchronous");
      }
      bind_policy = r.issues !== undefined ? undefined : r.value;
    } else {
      bind_policy = undefined;
    }
    return {
      id: String(o.id ?? ""),
      isTerminal: Boolean(o.isTerminal),
      max_bindings: parsePortMaxBindings(o),
      bind_policy: bind_policy ?? null,
      ttl: o.ttl,
    };
  });
  return { offerId, ports };
}

export function parseResolveBody(body: Record<string, unknown>): ResolveBody {
  const receiptsRaw = Array.isArray(body.content_receipts) ? body.content_receipts : [];
  const content_receipts = receiptsRaw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      resource_id: String(o.resource_id ?? ""),
      source_key: String(o.source_key ?? ""),
      content_sha256_hex: String(o.content_sha256_hex ?? ""),
    };
  });
  return {
    offerId: String(body.offerId ?? ""),
    portId: String(body.portId ?? ""),
    payload:
      body.payload != null && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : undefined,
    content_receipts: content_receipts.length > 0 ? content_receipts : undefined,
  };
}

export function applyProliferate(
  client: OBPPersistenceClient,
  partyId: string,
  body: ProliferateBody,
): void {
  const offer: Offer = {
    id: body.offerId,
    created_seq: 0,
    expires_seq: MAX_EXPIRES,
    type: "obp.frame",
    sourcemaps: [],
  };
  client.extendOffer({ partyId, offer, bindPortId: "" });
  for (const spec of body.ports) {
    client.exposePort({ offerId: body.offerId, port: mapPort(spec) });
  }
}

export function applyResolve(client: OBPPersistenceClient, partyId: string, body: ResolveBody): void {
  const bindOfferId = crypto.randomUUID();
  const offer: Offer = {
    id: bindOfferId,
    created_seq: 0,
    expires_seq: MAX_EXPIRES,
    type: "obp.frame.bind",
    sourcemaps: [],
  };
  client.extendOffer({
    partyId,
    offer,
    bindPortId: body.portId,
    counterparty_bind: body.payload ?? {},
    content_receipts: body.content_receipts,
  });
}
