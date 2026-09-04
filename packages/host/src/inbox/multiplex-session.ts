import type { AgentRequestEnvelope } from "@khoralabs/khora-auth";
import { bindErrorFrame, boundFrame, drainFrame, helloFrame } from "@khoralabs/khora-contracts";
import type { KhoraHostContext } from "../host/context";
import { popInboxDrainItemsForDid } from "./drain";
import type { InboxFanoutPort, InboxWebSocket } from "./fanout-port";

export { bindErrorFrame, boundFrame, drainFrame, helloFrame };

export const INBOX_DRAIN_CONCURRENCY = 4;

export type InboxMultiplexWsData = {
  kind: "inbox";
  connectionId: string;
  boundDids: Set<string>;
};

export function newInboxConnectionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type BindPrincipalWire = {
  did: string;
  ts: string | number;
  nonce: string;
  sig: string;
};

function parseBindPrincipals(raw: unknown): BindPrincipalWire[] | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const principals = (raw as { principals?: unknown }).principals;
  if (!Array.isArray(principals)) return undefined;
  const out: BindPrincipalWire[] = [];
  for (const p of principals) {
    if (p === null || typeof p !== "object") return undefined;
    const o = p as Record<string, unknown>;
    if (
      typeof o.did !== "string" ||
      (typeof o.ts !== "string" && typeof o.ts !== "number") ||
      typeof o.nonce !== "string" ||
      typeof o.sig !== "string"
    ) {
      return undefined;
    }
    out.push({ did: o.did, ts: o.ts, nonce: o.nonce, sig: o.sig });
  }
  return out;
}

function envelopeFromWire(p: BindPrincipalWire): AgentRequestEnvelope | undefined {
  const timestampMs = typeof p.ts === "number" ? p.ts : Number.parseInt(p.ts, 10);
  if (!Number.isSafeInteger(timestampMs) || timestampMs < 0) return undefined;
  return {
    did: p.did,
    timestampMs,
    nonce: p.nonce,
    signatureB64Url: p.sig,
  };
}

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const n = Math.max(1, concurrency);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i;
      i += 1;
      const item = items[idx];
      if (item === undefined) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export type HandleInboxClientMessageOpts = {
  ctx: KhoraHostContext;
  connectionId: string;
  boundDids: Set<string>;
  ws: InboxWebSocket;
  inboxHub: InboxFanoutPort;
  raw: string;
  /** Rate-limit callback before verifying a principal bind; return false to reject. */
  allowBind?: (did: string) => boolean;
};

/**
 * Handle one client→server JSON text frame for a multiplex inbox session.
 * Supports `bind` and `unbind`. Unknown frames are ignored.
 */
export async function handleInboxClientMessage(opts: HandleInboxClientMessageOpts): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(opts.raw) as unknown;
  } catch {
    return;
  }
  if (parsed === null || typeof parsed !== "object") return;
  const type = (parsed as { type?: unknown }).type;

  if (type === "unbind") {
    const dids = (parsed as { dids?: unknown }).dids;
    if (!Array.isArray(dids)) return;
    for (const did of dids) {
      if (typeof did !== "string" || did.length === 0) continue;
      if (!opts.boundDids.has(did)) continue;
      opts.boundDids.delete(did);
      opts.inboxHub.remove(did, opts.ws);
    }
    return;
  }

  if (type !== "bind") return;

  const principals = parseBindPrincipals(parsed);
  if (principals === undefined) {
    opts.ws.send(bindErrorFrame(undefined, "invalid bind frame"));
    return;
  }

  const toDrain: string[] = [];

  for (const wire of principals) {
    if (opts.allowBind !== undefined && !opts.allowBind(wire.did)) {
      opts.ws.send(bindErrorFrame(wire.did, "rate limited"));
      continue;
    }
    const envelope = envelopeFromWire(wire);
    if (envelope === undefined || envelope.did !== wire.did) {
      opts.ws.send(bindErrorFrame(wire.did, "invalid bind principal"));
      continue;
    }
    try {
      const { did } = await opts.ctx.auth.verifyInboxBind({
        connectionId: opts.connectionId,
        envelope,
      });
      if (opts.boundDids.has(did)) {
        opts.ws.send(boundFrame(did));
        continue;
      }
      opts.boundDids.add(did);
      opts.inboxHub.add(did, opts.ws);
      opts.ws.send(boundFrame(did));
      toDrain.push(did);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      opts.ws.send(bindErrorFrame(wire.did, msg));
    }
  }

  await mapPool(toDrain, INBOX_DRAIN_CONCURRENCY, async (did) => {
    try {
      const items = await popInboxDrainItemsForDid(opts.ctx, did);
      opts.ws.send(drainFrame(did, items));
    } catch {
      opts.ws.send(drainFrame(did, []));
    }
  });
}
