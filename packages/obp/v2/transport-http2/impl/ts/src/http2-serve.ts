import http2 from "node:http2";
import type { SecureContextOptions } from "node:tls";
import {
  canonicalSessionParties,
  createEd25519FrameVerifier,
  defaultSessionEnvelopeSyncAdapter,
  type FrameSessionHandlers,
  type FrameSigner,
  type FrameVerifier,
  partyIdForSigner,
  runFrameMultiplexSession,
  type SessionInitNormalized,
} from "@khoralabs/obp-v2-frames-impl";
import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";

import { frameChannelFromHttp2Stream } from "./http2-channel";

export type ObpOnConnectContext = {
  headers: http2.IncomingHttpHeaders;
  serverHost: string;
  serverPort: number;
};

export type ObpResolvedSession = {
  init: SessionInitNormalized;
  signer: FrameSigner;
};

type ObpServeListen = {
  host?: string;
  port: number;
  tls?: SecureContextOptions;
};

export type ObpServeOptions = {
  client: ObpPersistenceClient;
  listen: ObpServeListen;
  verifier?: FrameVerifier;
  onConnect: (ctx: ObpOnConnectContext) => ObpResolvedSession | Promise<ObpResolvedSession>;
} & Pick<FrameSessionHandlers, "onSessionReady" | "onIncomingOffer" | "onTerminate"> & {
    sessionEnvelopeSync?: boolean;
  };

export type ObpServerHandle = {
  close(): Promise<void>;
  port: number;
};

/** HTTP/2 reference binding: each **`POST /obp/v1`** stream runs {@link runFrameMultiplexSession} as responder. */
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
                  ...defaultSessionEnvelopeSyncAdapter(),
                  myPartyId: partyIdForSigner(ctx.init, ctx.signer.actor),
                }
              : undefined;

          const run = runFrameMultiplexSession({
            channel,
            signer: ctx.signer,
            verifier,
            client: options.client,
            sessionTemplate: {
              parties: canonicalSessionParties([ctx.init.parties[0], ctx.init.parties[1]]),
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
