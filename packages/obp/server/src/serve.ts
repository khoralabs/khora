import http2 from "node:http2";
import type { SecureContextOptions } from "node:tls";
import {
  createEd25519FrameVerifier,
  type FrameSessionHandlers,
  type FrameSigner,
  type FrameVerifier,
  type ObpPersistence,
  runFrameSession,
  type SessionInit,
} from "@cfd/obp-core";
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
} & Pick<FrameSessionHandlers, "onConnect" | "onBind" | "onProliferate" | "onTerminate">;

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
    ...(options.onConnect !== undefined ? { onConnect: options.onConnect } : {}),
    ...(options.onBind !== undefined ? { onBind: options.onBind } : {}),
    ...(options.onProliferate !== undefined ? { onProliferate: options.onProliferate } : {}),
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
    void runFrameSession({
      role: "responder",
      channel,
      signer: options.signer,
      verifier,
      persistence: options.persistence,
      ledgerSeq: options.ledgerSeq,
      init: options.init,
      handlers,
    }).catch(() => {
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
