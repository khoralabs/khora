import http2 from "node:http2";
import type { SecureContextOptions } from "node:tls";
import {
  createEd25519FrameVerifier,
  type FrameSessionHandlers,
  type FrameSigner,
  type FrameVerifier,
  type ObpPersistence,
  runFrameMultiplexSession,
  runFrameSession,
  type SessionInit,
  type SessionOp,
} from "@cfd/obp-core";
import { checkpointFromOps, verifyExtends } from "@cfd/obp-session-sync";
import { frameChannelFromHttp2Stream } from "./http2-channel.ts";

export type ObpServeOptions = {
  signer: FrameSigner;
  verifier?: FrameVerifier;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  /** Must match the init envelope the client will send (session_id, party_ids, actor_pubkeys, genesis_hash). */
  init: SessionInit;
  listen: {
    host?: string;
    port: number;
    tls?: SecureContextOptions;
  };
  /** When true, {@link ObpServeOptions.init} supplies only the `party_ids` / `actor_pubkeys` template; expect repeated `init` on one stream. */
  multiplex?: boolean;
} & Pick<FrameSessionHandlers, "onIncomingOffer" | "onTerminate"> & {
  /** Multiplex `session_envelope` on the same `/obp/v1` stream after frames (Merkle sync; ops must match frame-derived log). */
  sessionEnvelopeSync?: boolean;
  /** Apply TURN graph effects locally on outbound frames (use when server has its own store). */
  graphApplyOutbound?: boolean;
};

export type ObpServerHandle = {
  close(): Promise<void>;
  port: number;
};

/**
 * HTTP/2 reference binding for OBP frames (`obp://` = h2c, `obps://` = TLS + h2).
 * One `:path` `/obp/v1` stream → one `runFrameSession` (**responder** role).
 */
export function serveObp(options: ObpServeOptions): Promise<ObpServerHandle> {
  const verifier = options.verifier ?? createEd25519FrameVerifier();
  const handlers: FrameSessionHandlers = {
    ...(options.onIncomingOffer !== undefined ? { onIncomingOffer: options.onIncomingOffer } : {}),
    ...(options.onTerminate !== undefined ? { onTerminate: options.onTerminate } : {}),
  };

  const onStream = (stream: http2.ServerHttp2Stream, headers: http2.IncomingHttpHeaders): void => {
    if (headers[":method"] !== "POST" || headers[":path"] !== "/obp/v1") {
      stream.respond({ ":status": 404 });
      stream.end();
      return;
    }
    stream.respond({ ":status": 200 });
    const channel = frameChannelFromHttp2Stream(stream);
    const sessionEnvelopeSync =
      options.sessionEnvelopeSync === true
        ? {
            myPartyId: options.init.party_ids[0],
            checkpointFromOps: (ops: SessionOp[]) => checkpointFromOps(ops as unknown[]),
            verifyExtends,
          }
        : undefined;

    const run =
      options.multiplex === true
        ? runFrameMultiplexSession({
            role: "responder",
            channel,
            signer: options.signer,
            verifier,
            persistence: options.persistence,
            ledgerSeq: options.ledgerSeq,
            sessionTemplate: {
              party_ids: options.init.party_ids,
              actor_pubkeys: options.init.actor_pubkeys,
            },
            handlers,
            initiatorChainPlans: [],
            ...(sessionEnvelopeSync !== undefined ? { sessionEnvelopeSync } : {}),
            ...(options.graphApplyOutbound === true ? { graphApplyOutbound: true } : {}),
          })
        : runFrameSession({
            role: "responder",
            channel,
            signer: options.signer,
            verifier,
            persistence: options.persistence,
            ledgerSeq: options.ledgerSeq,
            init: options.init,
            handlers,
            ...(sessionEnvelopeSync !== undefined ? { sessionEnvelopeSync } : {}),
            ...(options.graphApplyOutbound === true ? { graphApplyOutbound: true } : {}),
          });

    void run.catch(() => {
      try {
        stream.destroy();
      } catch {
        /* ignore */
      }
    });
  };

  return new Promise((resolve, reject) => {
    const server =
      options.listen.tls !== undefined
        ? http2.createSecureServer(options.listen.tls)
        : http2.createServer();

    server.on("stream", onStream);
    server.on("error", reject);
    server.listen(options.listen.port, options.listen.host ?? "127.0.0.1", () => {
      const addr = server.address() as import("node:net").AddressInfo;
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
