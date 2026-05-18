import { Buffer } from "node:buffer";
import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import { createWebSocketDuplexByteStream } from "@khoralabs/duplex-byte-stream";
import { ObpError } from "@khoralabs/obp-v2-errors";
import {
  createEd25519FrameVerifier,
  defaultSessionEnvelopeSyncAdapter,
  type FrameMultiplexOpenerApi,
  type FrameSessionHandlers,
  type FrameSigner,
  type FrameVerifier,
  normalizeSessionInit,
  partyIdForSigner,
  type RunFrameMultiplexSessionArgs,
  runFrameMultiplexSession,
  type SessionInitNormalized,
} from "@khoralabs/obp-v2-frames-impl";
import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import {
  type Checkpoint,
  checkpointForSessionOps,
  type SessionOp,
} from "@khoralabs/obp-v2-session-impl";

export type ObpFrameConnection = FrameMultiplexOpenerApi;

export type ObpFrameChannelClientOptions = {
  channel: DuplexByteStream;
  signer: FrameSigner;
  verifier?: FrameVerifier;
  client: ObpPersistenceClient;
  sessionEnvelopeSync?: boolean;
  /** Multiplex lifecycle hooks (e.g. {@link FrameSessionHandlers.onSessionReady} for inbound SessionInit). */
  handlers?: FrameSessionHandlers;
  validateBindPayload?: RunFrameMultiplexSessionArgs["validateBindPayload"];
  /**
   * Optional HKDF binding (e.g. room id). Never derived from the host room ticket secret.
   * Frame bodies are always E2EE on this WebSocket entrypoint.
   */
  e2eeChannelBinding?: string;
};

export type ObpWebSocketConnectOptions = Omit<ObpFrameChannelClientOptions, "channel"> & {
  webSocketUrl: string;
  WebSocketCtor?: typeof WebSocket;
};

export async function connectObpFrameChannelSession(
  options: ObpFrameChannelClientOptions,
  runner: (conn: ObpFrameConnection) => Promise<void>,
): Promise<{ sessionOps: SessionOp[]; checkpoint: Checkpoint }> {
  const verifier = options.verifier ?? createEd25519FrameVerifier();
  const firstInitHolder: { v?: SessionInitNormalized } = {};
  const sessionEnvelopeSync =
    options.sessionEnvelopeSync === true
      ? {
          ...defaultSessionEnvelopeSyncAdapter(),
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
        }
      : undefined;

  const handlers: FrameSessionHandlers = options.handlers ?? {};

  const sessionOps = await runFrameMultiplexSession({
    channel: options.channel,
    signer: options.signer,
    verifier,
    client: options.client,
    handlers,
    frameChannelBodyE2ee: true,
    ...(options.e2eeChannelBinding !== undefined
      ? { e2eeChannelBinding: options.e2eeChannelBinding }
      : {}),
    ...(sessionEnvelopeSync !== undefined ? { sessionEnvelopeSync } : {}),
    ...(options.validateBindPayload !== undefined
      ? { validateBindPayload: options.validateBindPayload }
      : {}),
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

  const checkpoint = checkpointForSessionOps(sessionOps);
  return { sessionOps, checkpoint };
}

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

  const bridge = createWebSocketDuplexByteStream((bytes) => {
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
