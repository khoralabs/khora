import http2 from "node:http2";
import {
  createEd25519FrameVerifier,
  type FrameChannel,
  type FrameSessionHandlers,
  type FrameSigner,
  type FrameVerifier,
  type ObpPersistence,
  runFrameMultiplexSession,
  runFrameSession,
  type SessionInit,
  type SessionOp,
  type TurnBody,
} from "@cfd/obp-core";
import { type Checkpoint, checkpointFromOps, verifyExtends } from "@cfd/obp-session-sync";
import { frameChannelFromClientStream } from "./http2-channel.ts";

export type ObpConnectOptions = {
  /** `http://host:port` or `https://host:port` (HTTP/2 reference binding). */
  url: string;
  /** Default `/obp/v1` — must match the server. */
  path?: string;
  signer: FrameSigner;
  verifier?: FrameVerifier;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
  init: SessionInit;
  /** First TURN after `init` (required unless the server will speak first — not typical on this transport). */
  initialTurn?: TurnBody;
  handlers?: Pick<FrameSessionHandlers, "onIncomingOffer" | "onTerminate">;
  /** Multiplex `session_envelope` on the same stream after frames. */
  sessionEnvelopeSync?: boolean;
  /** Apply TURN graph effects locally on outbound frames (use when client has its own store). */
  graphApplyOutbound?: boolean;
  /**
   * When true, run {@link runFrameMultiplexSession}: several `session_id` / `genesis_hash` chains on one stream.
   * Use {@link ObpConnectOptions.initiatorChainPlans} or default to a single plan `{ init, initialTurn }`.
   */
  multiplex?: boolean;
  /** Initiator multiplex: ordered chain opens after the first (first plan defaults from `init` / `initialTurn`). */
  initiatorChainPlans?: Array<{ init: SessionInit; initialTurn?: TurnBody }>;
};

/**
 * Open one HTTP/2 client session and POST stream without tying stream end to `ClientHttp2Session.close()`.
 * Caller must invoke **`closeHttp2`** when fully done (or rely on process exit).
 */
export async function openObpHttp2Channel(
  url: string,
  path = "/obp/v1",
): Promise<{ channel: FrameChannel; closeHttp2: () => void }> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`openObpHttp2Channel: url must be http: or https:, got ${u.protocol}`);
  }
  const connectUrl = `${u.protocol}//${u.host}`;
  const client = http2.connect(connectUrl);
  return await new Promise((resolve, reject) => {
    client.on("error", reject);
    const req = client.request({ ":method": "POST", ":path": path });
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
 * Initiator: open HTTP/2 POST stream to an OBP reference server and run {@link runFrameSession}
 * or {@link runFrameMultiplexSession} when **`multiplex`** is set.
 * Returns canonical session ops and a Merkle checkpoint (see `cfd.obp.session`).
 */
export async function connectObpSession(
  options: ObpConnectOptions,
): Promise<{ sessionOps: SessionOp[]; checkpoint: Checkpoint }> {
  const u = new URL(options.url);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`connectObpSession: url must be http: or https:, got ${u.protocol}`);
  }
  const path = options.path ?? "/obp/v1";
  const verifier = options.verifier ?? createEd25519FrameVerifier();
  const connectUrl = `${u.protocol}//${u.host}`;

  const client = http2.connect(connectUrl);
  try {
    const channel = await new Promise<FrameChannel>((resolve, reject) => {
      client.on("error", reject);
      const req = client.request({ ":method": "POST", ":path": path });
      req.on("error", reject);
      resolve(frameChannelFromClientStream(req));
    });

    const handlers: Pick<FrameSessionHandlers, "onIncomingOffer" | "onTerminate"> = {
      ...(options.handlers?.onIncomingOffer !== undefined
        ? { onIncomingOffer: options.handlers.onIncomingOffer }
        : {}),
      ...(options.handlers?.onTerminate !== undefined
        ? { onTerminate: options.handlers.onTerminate }
        : {}),
    };

    const sessionEnvelopeSync =
      options.sessionEnvelopeSync === true
        ? {
            myPartyId: options.init.party_ids[1],
            checkpointFromOps: (ops: SessionOp[]) => checkpointFromOps(ops as unknown[]),
            verifyExtends,
          }
        : undefined;

    const sessionOps =
      options.multiplex === true
        ? await runFrameMultiplexSession({
            role: "initiator",
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
            ...(sessionEnvelopeSync !== undefined ? { sessionEnvelopeSync } : {}),
            ...(options.graphApplyOutbound === true ? { graphApplyOutbound: true } : {}),
            initiatorChainPlans:
              options.initiatorChainPlans ??
              [{ init: options.init, ...(options.initialTurn !== undefined ? { initialTurn: options.initialTurn } : {}) }],
          })
        : await runFrameSession({
            role: "initiator",
            channel,
            signer: options.signer,
            verifier,
            persistence: options.persistence,
            ledgerSeq: options.ledgerSeq,
            init: options.init,
            handlers,
            ...(options.initialTurn !== undefined ? { initialTurn: options.initialTurn } : {}),
            ...(sessionEnvelopeSync !== undefined ? { sessionEnvelopeSync } : {}),
            ...(options.graphApplyOutbound === true ? { graphApplyOutbound: true } : {}),
          });

    const checkpoint = checkpointFromOps(sessionOps);
    return { sessionOps, checkpoint };
  } finally {
    if (!client.destroyed) {
      client.close();
    }
  }
}
