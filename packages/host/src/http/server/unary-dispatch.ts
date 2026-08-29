import type { HostRouteDeps } from "../routes/deps";
import { routeUnary } from "../routes/router";

/** Canonical synthetic origin for IPC unary ingress (`req.url` / signing visibility only). */
export const KHORA_UNARY_INGRESS_ORIGIN = "http://khora.ipc";

export type HttpLikeUnaryCall = {
  method: string;
  /** Absolute path beginning with `/` (e.g. `/v1/inbox`). */
  pathname: string;
  /** Query string with or without leading `?`; empty means none. */
  search?: string | undefined;
  headers?: HeadersInit | undefined;
  body?: BodyInit | null | undefined;
  /**
   * Trusted synthetic peer IP for rolling rate limits (`defaultIp`, etc.).
   * Applied as `X-Real-IP` when not already set — **only** wire this from a trusted IPC boundary.
   */
  peerIp?: string | undefined;
};

/** Merge {@link HttpLikeUnaryCall.peerIp} into `X-Real-IP` when absent (trusted IPC ingress only). */
export function mergeUnaryPeerIp(headers: Headers, peerIp: string | undefined): Headers {
  const out = new Headers(headers);
  if (peerIp !== undefined && peerIp.trim().length > 0 && !out.has("x-real-ip")) {
    out.set("X-Real-IP", peerIp.trim());
  }
  return out;
}

function normalizePathname(pathname: string): string {
  const p = pathname.trim();
  return p.startsWith("/") ? p : `/${p}`;
}

function normalizeSearch(search: string | undefined): string {
  if (search === undefined || search.trim().length === 0) return "";
  const s = search.trim();
  return s.startsWith("?") ? s : `?${s}`;
}

/**
 * Dispatch one unary request using the same handlers as HTTP, without WebSocket upgrade.
 */
export async function dispatchHttpLikeUnary(
  call: HttpLikeUnaryCall,
  deps: HostRouteDeps,
): Promise<Response> {
  const pathname = normalizePathname(call.pathname);
  const qs = normalizeSearch(call.search);
  const url = new URL(`${KHORA_UNARY_INGRESS_ORIGIN}${pathname}${qs}`);
  const hdrs = mergeUnaryPeerIp(new Headers(call.headers ?? {}), call.peerIp);
  const method = call.method.trim().toUpperCase() || "GET";
  const init: RequestInit = { method, headers: hdrs };
  if (method !== "GET" && method !== "HEAD" && call.body !== undefined && call.body !== null) {
    init.body = call.body as BodyInit;
  }
  const req = new Request(url.toString(), init);
  const res = await routeUnary(req, url, deps);
  return res ?? new Response("Not found", { status: 404 });
}
