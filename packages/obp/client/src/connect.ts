import type { OutgoingHttpHeaders } from "node:http";
import http2 from "node:http2";
import type { FrameChannel } from "@khoralabs/frame-channel";
import {
  createEd25519FrameVerifier,
  type FrameMultiplexOpenerApi,
  type FrameSigner,
  type FrameVerifier,
  normalizeSessionInit,
  ObpError,
  partyIdForSigner,
  runFrameMultiplexSession,
  type SessionInit,
  type SessionOp,
} from "@khoralabs/obp-core";
import type { ObpPersistence } from "@khoralabs/obp-persistence-client";
import { type Checkpoint, checkpointFromOps, verifyExtends } from "@khoralabs/obp-session-sync";
import { frameChannelFromClientStream } from "./http2-channel.ts";

/** Re-exported opener surface for a multiplex HTTP/2 connection. */
export type ObpFrameConnection = FrameMultiplexOpenerApi;

/** HTTP/2 `:path` for POST: pathname + search; `/` alone maps to `/obp/v1` (reference binding default). */
function postPathFromObpEndpointUrl(u: URL): string {
  const path = u.pathname === "/" || u.pathname === "" ? "/obp/v1" : u.pathname;
  return `${path}${u.search}`;
}

export type ObpConnectOptions = {
  /**
   * Endpoint URL for the HTTP/2 POST stream, e.g. `http://127.0.0.1:8765/obp/v1`.
   * Host (and port) are used for `http2.connect`; pathname + query become `:path`.
   * If the pathname is `/` (origin-only URL), `:path` defaults to `/obp/v1`.
   */
  url: string;
  /** Sent with POST (e.g. `authorization`); must satisfy the server `onConnect` handler. */
  requestHeaders?: OutgoingHttpHeaders;
  signer: FrameSigner;
  verifier?: FrameVerifier;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  /** Multiplex `session_envelope` on the same stream after frames. */
  sessionEnvelopeSync?: boolean;
};

/**
 * Open one HTTP/2 client session and POST stream without tying stream end to `ClientHttp2Session.close()`.
 * Caller must invoke **`closeHttp2`** when fully done (or rely on process exit).
 */
export async function openObpHttp2Channel(
  endpointUrl: string,
): Promise<{ channel: FrameChannel; closeHttp2: () => void }> {
  const u = new URL(endpointUrl);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`openObpHttp2Channel: url must be http: or https:, got ${u.protocol}`);
  }
  const connectUrl = `${u.protocol}//${u.host}`;
  const postPath = postPathFromObpEndpointUrl(u);
  const client = http2.connect(connectUrl);
  return await new Promise((resolve, reject) => {
    client.on("error", reject);
    const req = client.request({ ":method": "POST", ":path": postPath });
    req.on("error", reject);
    resolve({
      channel: frameChannelFromClientStream(req),
      closeHttp2: () => {
        if (!client.destroyed) client.close();
      },
    });
  });
}

/**
 * Open an HTTP/2 POST stream to an OBP reference server and run a deferred multiplex opener:
 * {@link ObpFrameConnection.init} / {@link ObpFrameConnection.close}.
 *
 * Returns canonical session ops and a Merkle checkpoint (see `cfd.obp.session`).
 */
export async function connectObpSession(
  options: ObpConnectOptions,
  runner: (conn: ObpFrameConnection) => Promise<void>,
): Promise<{ sessionOps: SessionOp[]; checkpoint: Checkpoint }> {
  const u = new URL(options.url);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`connectObpSession: url must be http: or https:, got ${u.protocol}`);
  }
  const postPath = postPathFromObpEndpointUrl(u);
  const verifier = options.verifier ?? createEd25519FrameVerifier();
  const connectUrl = `${u.protocol}//${u.host}`;

  const client = http2.connect(connectUrl);
  try {
    const channel = await new Promise<FrameChannel>((resolve, reject) => {
      client.on("error", reject);
      const req = client.request({
        ":method": "POST",
        ":path": postPath,
        ...(options.requestHeaders ?? {}),
      });
      req.on("error", reject);
      resolve(frameChannelFromClientStream(req));
    });

    const firstInitHolder: { v?: SessionInit } = {};
    const sessionEnvelopeSync =
      options.sessionEnvelopeSync === true
        ? {
            getMyPartyId: () => {
              const init = firstInitHolder.v;
              if (init === undefined) {
                throw new ObpError(
                  "VALIDATION",
                  "sessionEnvelopeSync party id unavailable before first conn.init",
                );
              }
              return partyIdForSigner(init, options.signer.actor);
            },
            checkpointFromOps: (ops: SessionOp[]) => checkpointFromOps(ops as unknown[]),
            verifyExtends,
          }
        : undefined;

    const sessionOps = await runFrameMultiplexSession({
      channel,
      signer: options.signer,
      verifier,
      persistence: options.persistence,
      ledgerSeq: options.ledgerSeq,
      handlers: {},
      ...(sessionEnvelopeSync !== undefined ? { sessionEnvelopeSync } : {}),
      openerSession: async (api) => {
        const conn: ObpFrameConnection = {
          async init(init, hooks) {
            const norm = normalizeSessionInit(init);
            if (firstInitHolder.v === undefined) firstInitHolder.v = norm;
            return api.init(init, hooks);
          },
          close: () => api.close(),
        };
        try {
          await runner(conn);
        } finally {
          api.close();
        }
      },
    });

    const checkpoint = checkpointFromOps(sessionOps);
    return { sessionOps, checkpoint };
  } finally {
    if (!client.destroyed) {
      client.close();
    }
  }
}
