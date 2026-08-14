import type { RelaySigner } from "@khoralabs/khora-auth";
import type { KhoraDuplexTransport } from "./duplex-ws";
import { WsKhoraDuplexTransport } from "./duplex-ws";
import {
  type CreateHttpTransportOptions,
  createHttpKhoraUnaryTransport,
  type KhoraFetch,
  type KhoraUnaryTransport,
} from "./unary-http";

export type KhoraTransportBundle = {
  unary: KhoraUnaryTransport;
  duplex: KhoraDuplexTransport;
};

export type CreateHttpKhoraTransportBundleOptions = CreateHttpTransportOptions;

/** HTTP unary + WebSocket duplex — production default. */
export function createHttpKhoraTransportBundle(
  opts: CreateHttpKhoraTransportBundleOptions,
): KhoraTransportBundle {
  return {
    unary: createHttpKhoraUnaryTransport(opts),
    duplex: new WsKhoraDuplexTransport(),
  };
}

export type CreateKhoraTransportBundleFromEnvOptions = {
  /** HTTP origin when `KHORA_TRANSPORT` is `http` (default). */
  baseUrl: string;
  signer: RelaySigner;
  fetch?: KhoraFetch;
  nowMs?: () => number;
  nonceFactory?: () => string;
  env?: NodeJS.ProcessEnv;
};

/**
 * Deployment-time transport selection. Today only `http` is implemented (WebSocket duplex for NBC/inbox).
 * Future: `ipc`, `inproc` — extend without changing `KhoraClient` call sites.
 */
export function createKhoraTransportBundleFromEnv(
  opts: CreateKhoraTransportBundleFromEnvOptions,
): KhoraTransportBundle {
  const env = opts.env ?? process.env;
  const mode = (env.KHORA_TRANSPORT ?? "http").trim().toLowerCase();
  if (mode === "http" || mode === "") {
    return createHttpKhoraTransportBundle({
      baseUrl: opts.baseUrl,
      signer: opts.signer,
      fetch: opts.fetch,
      nowMs: opts.nowMs,
      nonceFactory: opts.nonceFactory,
    });
  }
  throw new Error(
    `KHORA_TRANSPORT=${mode} is not implemented; supported: http (omit or set explicitly).`,
  );
}
