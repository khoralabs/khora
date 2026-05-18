import type { AgentSigner } from "@khoralabs/at2-auth";
import type { At2DuplexTransport } from "./duplex-ws.ts";
import { WsAt2DuplexTransport } from "./duplex-ws.ts";
import {
  type At2Fetch,
  type At2UnaryTransport,
  type CreateHttpTransportOptions,
  createHttpAt2UnaryTransport,
} from "./unary-http.ts";

export type At2TransportBundle = {
  unary: At2UnaryTransport;
  duplex: At2DuplexTransport;
};

export type CreateHttpAt2TransportBundleOptions = CreateHttpTransportOptions;

/** HTTP unary + WebSocket duplex — production default. */
export function createHttpAt2TransportBundle(
  opts: CreateHttpAt2TransportBundleOptions,
): At2TransportBundle {
  return {
    unary: createHttpAt2UnaryTransport(opts),
    duplex: new WsAt2DuplexTransport(),
  };
}

export type CreateAt2TransportBundleFromEnvOptions = {
  /** HTTP origin when `AT2_TRANSPORT` is `http` (default). */
  baseUrl: string;
  signer: AgentSigner;
  fetch?: At2Fetch;
  nowMs?: () => number;
  nonceFactory?: () => string;
  env?: NodeJS.ProcessEnv;
};

/**
 * Deployment-time transport selection. Today only `http` is implemented (WebSocket duplex for NBC/inbox).
 * Future: `ipc`, `inproc` — extend without changing `At2Client` call sites.
 */
export function createAt2TransportBundleFromEnv(
  opts: CreateAt2TransportBundleFromEnvOptions,
): At2TransportBundle {
  const env = opts.env ?? process.env;
  const mode = (env.AT2_TRANSPORT ?? "http").trim().toLowerCase();
  if (mode === "http" || mode === "") {
    return createHttpAt2TransportBundle({
      baseUrl: opts.baseUrl,
      signer: opts.signer,
      fetch: opts.fetch,
      nowMs: opts.nowMs,
      nonceFactory: opts.nonceFactory,
    });
  }
  throw new Error(
    `AT2_TRANSPORT=${mode} is not implemented; supported: http (omit or set explicitly).`,
  );
}
