import http2 from "node:http2";
import type { SecureContextOptions } from "node:tls";
import {
  createEd25519FrameVerifier,
  type FrameSessionHandlers,
  type FrameSigner,
  type FrameVerifier,
  partyIdForSigner,
  runFrameMultiplexSession,
  type SessionInit,
  type SessionOp,
} from "@khoralabs/obp-core";
import type { ObpPersistence } from "@khoralabs/obp-persistence-client";
import { checkpointFromOps, verifyExtends } from "@khoralabs/obp-session-sync";
import { frameChannelFromHttp2Stream } from "./http2-channel.ts";

export type ObpOnConnectContext = {
  headers: http2.IncomingHttpHeaders;
  serverHost: string;
  serverPort: number;
};

export type ObpResolvedSession = {
  init: SessionInit;
  signer: FrameSigner;
};

type ObpServeListen = {
  host?: string;
  port: number;
  tls?: SecureContextOptions;
};

type ObpServeCommon = {
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  listen: ObpServeListen;
  verifier?: FrameVerifier;
} & Pick<FrameSessionHandlers, "onSessionReady" | "onIncomingOffer" | "onTerminate"> & {
    sessionEnvelopeSync?: boolean;
  };

/** Per-stream server-side config from authenticated HTTP request context. */
export type ObpServeOptions = ObpServeCommon & {
  /**
   * Called once per `/obp/v1` stream before frames are read (headers available). Derive `SessionInit` + {@link FrameSigner} from auth (e.g. verify `Authorization`).
   * On throw / rejection the stream responds with **401** and ends.
   */
  onConnect: (ctx: ObpOnConnectContext) => ObpResolvedSession | Promise<ObpResolvedSession>;
};

export type ObpServerHandle = {
  close(): Promise<void>;
  port: number;
};

/**
 * HTTP/2 reference binding for OBP frames (`obp://` = h2c, `obps://` = TLS + h2).
 * Each `:path` `/obp/v1` stream runs {@link runFrameMultiplexSession} as responder: the stream stays alive across
 * TERMINATE so the peer can open additional chains. The client drives closure via {@link FrameMultiplexOpenerApi.close}
 * and idle shutdown.
 */
export function serveObp(options: ObpServeOptions): Promise<ObpServerHandle> {
  const verifier = options.verifier ?? createEd25519FrameVerifier();
  const handlers: FrameSessionHandlers = {
    ...(options.onSessionReady !== undefined ? { onSessionReady: options.onSessionReady } : {}),
    ...(options.onIncomingOffer !== undefined ? { onIncomingOffer: options.onIncomingOffer } : {}),
    ...(options.onTerminate !== undefined ? { onTerminate: options.onTerminate } : {}),
  };

  return new Promise((resolve, reject) => {
    const server =
      options.listen.tls !== undefined
        ? http2.createSecureServer(options.listen.tls)
        : http2.createServer();

    server.on("error", reject);

    const host = options.listen.host ?? "127.0.0.1";

    server.listen(options.listen.port, host, () => {
      const addr = server.address() as import("node:net").AddressInfo;
      const effectivePort = addr.port;

      const onStream = (
        stream: http2.ServerHttp2Stream,
        headers: http2.IncomingHttpHeaders,
      ): void => {
        void (async () => {
          if (headers[":method"] !== "POST" || headers[":path"] !== "/obp/v1") {
            stream.respond({ ":status": 404 });
            stream.end();
            return;
          }

          let ctx: ObpResolvedSession;
          try {
            ctx = await options.onConnect({
              headers,
              serverHost: host,
              serverPort: effectivePort,
            });
          } catch {
            try {
              stream.respond({ ":status": 401 });
              stream.end();
            } catch {
              /* ignore */
            }
            return;
          }

          stream.respond({ ":status": 200 });
          const channel = frameChannelFromHttp2Stream(stream);
          const sessionEnvelopeSync =
            options.sessionEnvelopeSync === true
              ? {
                  myPartyId: partyIdForSigner(ctx.init, ctx.signer.actor),
                  checkpointFromOps: (ops: SessionOp[]) => checkpointFromOps(ops as unknown[]),
                  verifyExtends,
                }
              : undefined;

          const run = runFrameMultiplexSession({
            channel,
            signer: ctx.signer,
            verifier,
            persistence: options.persistence,
            ledgerSeq: options.ledgerSeq,
            sessionTemplate: {
              parties: ctx.init.parties,
            },
            handlers,
            initiatorChainPlans: [],
            ...(sessionEnvelopeSync !== undefined ? { sessionEnvelopeSync } : {}),
          });

          void run.catch(() => {
            try {
              stream.destroy();
            } catch {
              /* ignore */
            }
          });
        })();
      };

      server.on("stream", onStream);
      resolve({
        port: effectivePort,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
