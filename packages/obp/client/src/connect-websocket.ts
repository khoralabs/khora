import { Buffer } from "node:buffer";
import type { FrameChannel } from "@khoralabs/frame-channel";
import { createWebSocketFrameChannel } from "@khoralabs/frame-channel";
import {
  createEd25519FrameVerifier,
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
import type { ObpFrameConnection } from "./connect.ts";

/** Client-side multiplex over an existing duplex {@link FrameChannel} (same wire as HTTP/2 OBP). */
export type ObpFrameChannelClientOptions = {
  channel: FrameChannel;
  signer: FrameSigner;
  verifier?: FrameVerifier;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  sessionEnvelopeSync?: boolean;
};

/** Same fields as {@link ObpFrameChannelClientOptions} except `channel` — {@link connectObpWebSocketSession} wires the WebSocket internally. */
export type ObpWebSocketConnectOptions = Omit<ObpFrameChannelClientOptions, "channel"> & {
  /**
   * Full WebSocket URL including path and `ticket` query param, e.g.
   * `ws://127.0.0.1:3000/v1/atrium/rooms/my-room/ws?ticket=…`
   */
  webSocketUrl: string;
  /** Override for tests (defaults to global `WebSocket`). */
  WebSocketCtor?: typeof WebSocket;
};

/**
 * Same multiplex session as {@link connectObpSession} over any {@link FrameChannel} (WebSocket relay,
 * in-memory pair, etc.). Use {@link connectObpWebSocketSession} for Bun/Web `WebSocket` wiring.
 */
export async function connectObpFrameChannelSession(
  options: ObpFrameChannelClientOptions,
  runner: (conn: ObpFrameConnection) => Promise<void>,
): Promise<{ sessionOps: SessionOp[]; checkpoint: Checkpoint }> {
  const verifier = options.verifier ?? createEd25519FrameVerifier();
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
    channel: options.channel,
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
}

/**
 * Same as {@link connectObpFrameChannelSession} but wraps a `WebSocket` with
 * {@link createWebSocketFrameChannel}. Carries the reference **length-prefixed JSON** byte stream;
 * each binary message is one ordered chunk (the core decoder may buffer partial frames).
 */
export async function connectObpWebSocketSession(
  options: ObpWebSocketConnectOptions,
  runner: (conn: ObpFrameConnection) => Promise<void>,
): Promise<{ sessionOps: SessionOp[]; checkpoint: Checkpoint }> {
  const { webSocketUrl, WebSocketCtor, ...rest } = options;
  const WS = WebSocketCtor ?? WebSocket;
  if (typeof WS !== "function") {
    throw new Error("connectObpWebSocketSession: WebSocket is not available (pass WebSocketCtor)");
  }
  const ws = new WS(webSocketUrl);
  ws.binaryType = "arraybuffer";

  await new Promise<void>((resolve, reject) => {
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onErr = (e: Event): void => {
      cleanup();
      reject(new Error(`WebSocket error: ${String((e as ErrorEvent).message ?? "error")}`));
    };
    const cleanup = (): void => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onErr);
    };
    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("error", onErr, { once: true });
  });

  const bridge = createWebSocketFrameChannel((bytes) => {
    ws.send(bytes);
  });

  const onMessage = (ev: MessageEvent): void => {
    const d = ev.data;
    if (d instanceof ArrayBuffer) {
      bridge.onMessage(d);
    } else if (d instanceof Uint8Array) {
      bridge.onMessage(d);
    } else if (Buffer.isBuffer(d)) {
      bridge.onMessage(new Uint8Array(d));
    } else if (typeof Blob !== "undefined" && d instanceof Blob) {
      void d.arrayBuffer().then((b) => bridge.onMessage(b));
    }
  };
  const onClose = (): void => {
    bridge.onClose();
  };
  ws.addEventListener("message", onMessage);
  ws.addEventListener("close", onClose);

  try {
    return await connectObpFrameChannelSession({ ...rest, channel: bridge.channel }, runner);
  } finally {
    ws.removeEventListener("message", onMessage);
    ws.removeEventListener("close", onClose);
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
}
