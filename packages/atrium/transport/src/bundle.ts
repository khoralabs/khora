import type { AgentSigner } from "@khoralabs/atrium-auth";
import type { AtriumDuplexTransport } from "./duplex-ws.ts";
import { WsAtriumDuplexTransport } from "./duplex-ws.ts";
import {
  type AtriumFetch,
  type AtriumUnaryTransport,
  type CreateHttpTransportOptions,
  createHttpAtriumUnaryTransport,
} from "./unary-http.ts";

export type AtriumTransportBundle = {
  unary: AtriumUnaryTransport;
  duplex: AtriumDuplexTransport;
};

export type CreateHttpAtriumTransportBundleOptions = CreateHttpTransportOptions;

/** HTTP unary + WebSocket duplex — production default. */
export function createHttpAtriumTransportBundle(
  opts: CreateHttpAtriumTransportBundleOptions,
): AtriumTransportBundle {
  return {
    unary: createHttpAtriumUnaryTransport(opts),
    duplex: new WsAtriumDuplexTransport(),
  };
}

export type CreateAtriumTransportBundleFromEnvOptions = {
  /** HTTP origin when `ATRIUM_TRANSPORT` is `http` (default). */
  baseUrl: string;
  signer: AgentSigner;
  fetch?: AtriumFetch;
  nowMs?: () => number;
  nonceFactory?: () => string;
  env?: NodeJS.ProcessEnv;
};

/**
 * Deployment-time transport selection. Today only `http` is implemented (WebSocket duplex for NBC/inbox).
 * Future: `ipc`, `inproc` — extend without changing `AtriumClient` call sites.
 */
export function createAtriumTransportBundleFromEnv(
  opts: CreateAtriumTransportBundleFromEnvOptions,
): AtriumTransportBundle {
  const env = opts.env ?? process.env;
  const mode = (env.ATRIUM_TRANSPORT ?? "http").trim().toLowerCase();
  if (mode === "http" || mode === "") {
    return createHttpAtriumTransportBundle({
      baseUrl: opts.baseUrl,
      signer: opts.signer,
      fetch: opts.fetch,
      nowMs: opts.nowMs,
      nonceFactory: opts.nonceFactory,
    });
  }
  throw new Error(
    `ATRIUM_TRANSPORT=${mode} is not implemented; supported: http (omit or set explicitly).`,
  );
}
