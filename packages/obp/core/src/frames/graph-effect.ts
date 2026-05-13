import { portBindPolicySchema } from "../bind-policy/index.ts";
import type { NegotiationPortTtlBasis, Offer, Port, SourceMapRef } from "../model/types.ts";
import type { OBPPersistenceClient } from "@khoralabs/obp-persistence-client";
import { ObpError } from "../obp-error.ts";
import type { PortSpec, TurnBody } from "./types.ts";

const MAX_EXPIRES = Number.MAX_SAFE_INTEGER;

/** Summary of ids minted by {@link applyTurn} for audit derivation. */
export type ApplyTurnResult = {
  offerId: string;
  exposedPortIds: string[];
};

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

function parseNegotiationPortTtlBasis(raw: unknown): NegotiationPortTtlBasis {
  if (raw === "turns" || raw === "ledger_seq") return raw;
  throw new ObpError("VALIDATION", "port ttl_basis must be turns or ledger_seq when present");
}

function mapPort(spec: PortSpec): Port {
  const expiresSeq =
    spec.expires_seq !== undefined && Number.isFinite(spec.expires_seq)
      ? spec.expires_seq
      : MAX_EXPIRES;
  const type =
    spec.portType !== undefined && spec.portType.trim() !== ""
      ? spec.portType.trim()
      : "obp.frame.port";
  const promise =
    spec.promise !== undefined && spec.promise.trim() !== "" ? spec.promise.trim() : spec.id;

  const port: Port = {
    id: spec.id,
    created_seq: 0,
    expires_seq: expiresSeq,
    type,
    promise,
    max_bindings: spec.max_bindings ?? 1,
    terminal: spec.isTerminal,
    ref: spec.ref?.trim() ?? "",
    sourcemaps: spec.sourcemaps ?? [],
    ...(spec.bind_policy != null && spec.bind_policy !== undefined
      ? { bind_policy: spec.bind_policy }
      : {}),
  };
  if (spec.expose_seq !== undefined) {
    port.expose_seq = spec.expose_seq;
  }
  if (spec.ttl_basis !== undefined) {
    port.ttl_basis = spec.ttl_basis;
  }
  if (spec.ttl_measure !== undefined) {
    port.ttl_measure = spec.ttl_measure;
  }
  return port;
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

    let expires_seq: number | undefined;
    if (o.expires_seq !== undefined && o.expires_seq !== null) {
      const n = Number(o.expires_seq);
      if (!Number.isInteger(n) || n < 1) {
        throw new ObpError(
          "VALIDATION",
          "port expires_seq must be a positive integer when present",
        );
      }
      expires_seq = n;
    }

    let expose_seq: number | undefined;
    if (o.expose_seq !== undefined && o.expose_seq !== null) {
      const n = Number(o.expose_seq);
      if (!Number.isInteger(n) || n < 0) {
        throw new ObpError(
          "VALIDATION",
          "port expose_seq must be a non-negative integer when present",
        );
      }
      expose_seq = n;
    }

    let ttl_measure: number | undefined;
    if (o.ttl_measure !== undefined && o.ttl_measure !== null) {
      const n = Number(o.ttl_measure);
      if (!Number.isInteger(n) || n < 1) {
        throw new ObpError(
          "VALIDATION",
          "port ttl_measure must be a positive integer when present",
        );
      }
      ttl_measure = n;
    }

    const rawPortType = o.portType ?? o.type;
    const portType =
      rawPortType !== undefined && rawPortType !== null ? String(rawPortType) : undefined;
    const promise = o.promise !== undefined && o.promise !== null ? String(o.promise) : undefined;
    const ref = o.ref !== undefined && o.ref !== null ? String(o.ref) : undefined;

    let ttl_basis: PortSpec["ttl_basis"];
    if (o.ttl_basis !== undefined && o.ttl_basis !== null) {
      ttl_basis = parseNegotiationPortTtlBasis(o.ttl_basis);
    }

    const portSm = parseSourcemaps(o.sourcemaps);

    return {
      id: String(o.id ?? ""),
      isTerminal: Boolean(o.isTerminal),
      max_bindings: parsePortMaxBindings(o),
      bind_policy: bind_policy ?? null,
      ttl: o.ttl,
      ...(portType !== undefined ? { portType } : {}),
      ...(promise !== undefined ? { promise } : {}),
      ...(ref !== undefined ? { ref } : {}),
      ...(expose_seq !== undefined ? { expose_seq } : {}),
      ...(ttl_basis !== undefined ? { ttl_basis } : {}),
      ...(ttl_measure !== undefined ? { ttl_measure } : {}),
      ...(expires_seq !== undefined ? { expires_seq } : {}),
      ...(portSm !== undefined ? { sourcemaps: portSm } : {}),
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

  let offer_expires_seq: number | undefined;
  if (body.expires_seq !== undefined && body.expires_seq !== null) {
    const n = Number(body.expires_seq);
    if (!Number.isInteger(n) || n < 1) {
      throw new ObpError("VALIDATION", "expires_seq must be a positive integer when present");
    }
    offer_expires_seq = n;
  }

  return {
    offerId: String(body.offerId ?? ""),
    offerType: String(body.offerType ?? ""),
    ...(offer_expires_seq !== undefined ? { expires_seq: offer_expires_seq } : {}),
    ...(turn_seq !== undefined ? { turn_seq } : {}),
    sourcemaps: parseSourcemaps(body.sourcemaps),
    ttl: body.ttl,
    ...(ports.length > 0 ? { ports } : {}),
    bindPortId: String(body.bindPortId ?? "").trim() || undefined,
    ...(content_receipts.length > 0 ? { content_receipts } : {}),
    ...(counterparty_bind !== undefined ? { counterparty_bind } : {}),
  };
}

export function applyTurn(
  client: OBPPersistenceClient,
  partyId: string,
  body: TurnBody,
): ApplyTurnResult {
  const offerId = body.offerId.trim() === "" ? crypto.randomUUID() : body.offerId;
  const offerExpiresSeq =
    body.expires_seq !== undefined && Number.isFinite(body.expires_seq)
      ? body.expires_seq
      : MAX_EXPIRES;
  const offer: Offer = {
    id: offerId,
    created_seq: 0,
    expires_seq: offerExpiresSeq,
    type: body.offerType,
    sourcemaps: body.sourcemaps ?? [],
  };

  const bindPortId = body.bindPortId?.trim() ?? "";
  const { offer: persistedOffer } = client.extendOffer({
    partyId,
    offer,
    bindPortId,
    ...(bindPortId !== "" ? { counterparty_bind: body.counterparty_bind ?? {} } : {}),
    ...(body.content_receipts !== undefined && body.content_receipts.length > 0
      ? { content_receipts: body.content_receipts }
      : {}),
  });

  const exposedPortIds: string[] = [];
  for (const spec of body.ports ?? []) {
    const { port } = client.exposePort({ offerId: persistedOffer.id, port: mapPort(spec) });
    exposedPortIds.push(port.id);
  }

  return { offerId: persistedOffer.id, exposedPortIds };
}
