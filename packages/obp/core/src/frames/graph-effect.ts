import { portBindPolicySchema } from "../bind-policy/index.ts";
import type { Offer, Port, SourceMapRef } from "../model/types.ts";
import { ObpError } from "../persistence/client/errors.ts";
import type { OBPPersistenceClient } from "../persistence/client/obp-persistence-client.ts";
import type { PortSpec, TurnBody } from "./types.ts";

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

function parseSourcemaps(raw: unknown): SourceMapRef[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((s) => {
    const o = s as Record<string, unknown>;
    return {
      resource_id: String(o.resource_id ?? ""),
      source_key: String(o.source_key ?? ""),
    };
  });
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

export function parseTurnBody(body: Record<string, unknown>): TurnBody {
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

  const receiptsRaw = Array.isArray(body.content_receipts) ? body.content_receipts : [];
  const content_receipts = receiptsRaw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      resource_id: String(o.resource_id ?? ""),
      source_key: String(o.source_key ?? ""),
      content_sha256_hex: String(o.content_sha256_hex ?? ""),
    };
  });

  let counterparty_bind: Record<string, unknown> | undefined;
  if (
    body.counterparty_bind != null &&
    typeof body.counterparty_bind === "object" &&
    !Array.isArray(body.counterparty_bind)
  ) {
    counterparty_bind = body.counterparty_bind as Record<string, unknown>;
  }

  let turn_seq: number | undefined;
  if (body.turn_seq !== undefined && body.turn_seq !== null) {
    const n = Number(body.turn_seq);
    if (!Number.isInteger(n) || n < 0) {
      throw new ObpError("VALIDATION", "turn_seq must be a non-negative integer when present");
    }
    turn_seq = n;
  }

  return {
    offerId: String(body.offerId ?? ""),
    offerType: String(body.offerType ?? ""),
    ...(turn_seq !== undefined ? { turn_seq } : {}),
    sourcemaps: parseSourcemaps(body.sourcemaps),
    ttl: body.ttl,
    ...(ports.length > 0 ? { ports } : {}),
    bindPortId: String(body.bindPortId ?? "").trim() || undefined,
    ...(content_receipts.length > 0 ? { content_receipts } : {}),
    ...(counterparty_bind !== undefined ? { counterparty_bind } : {}),
  };
}

export function applyTurn(client: OBPPersistenceClient, partyId: string, body: TurnBody): void {
  const offerId = body.offerId.trim() === "" ? crypto.randomUUID() : body.offerId;
  const offer: Offer = {
    id: offerId,
    created_seq: 0,
    expires_seq: MAX_EXPIRES,
    type: body.offerType,
    sourcemaps: body.sourcemaps ?? [],
  };

  const bindPortId = body.bindPortId?.trim() ?? "";
  client.extendOffer({
    partyId,
    offer,
    bindPortId,
    ...(bindPortId !== "" ? { counterparty_bind: body.counterparty_bind ?? {} } : {}),
    ...(body.content_receipts !== undefined && body.content_receipts.length > 0
      ? { content_receipts: body.content_receipts }
      : {}),
  });

  for (const spec of body.ports ?? []) {
    client.exposePort({ offerId: offer.id, port: mapPort(spec) });
  }
}
