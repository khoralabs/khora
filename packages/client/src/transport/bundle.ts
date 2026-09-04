import type { Signer } from "@khoralabs/khora-auth";
import { type KhoraDuplexTransport, WsKhoraDuplexTransport } from "./duplex-ws";
import {
  type CreateHttpTransportOptions,
  createHttpKhoraUnaryTransport,
  type KhoraFetch,
  type KhoraHttpUnaryTransport,
} from "./unary-http";

export type KhoraTransportBundle = {
  /** Explicitly HTTP-shaped unary binding. */
  unary: KhoraHttpUnaryTransport;
  duplex: KhoraDuplexTransport;
};

export type CreateHttpKhoraTransportBundleOptions = CreateHttpTransportOptions & {
  WebSocket?: typeof WebSocket;
};

/** HTTP unary + WebSocket duplex — production default. */
export function createHttpKhoraTransportBundle(
  opts: CreateHttpKhoraTransportBundleOptions,
): KhoraTransportBundle {
  const unary = createHttpKhoraUnaryTransport(opts);
  return {
    unary,
    duplex: new WsKhoraDuplexTransport({
      base: unary.base,
      signer: opts.signer,
      now: unary.now,
      nonce: unary.nonce,
      WebSocketCtor: opts.WebSocket,
    }),
  };
}

export type CreateKhoraTransportBundleFromEnvOptions = {
  /** HTTP origin when `KHORA_TRANSPORT` is `http` (default). */
  baseUrl: string;
  signer: Signer;
  fetch?: KhoraFetch;
  nowMs?: () => number;
  nonceFactory?: () => string;
  WebSocket?: typeof WebSocket;
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
      WebSocket: opts.WebSocket,
    });
  }
  throw new Error(
    `KHORA_TRANSPORT=${mode} is not implemented; supported: http (omit or set explicitly).`,
  );
}
