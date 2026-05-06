import http2 from "node:http2";
import {
  createEd25519FrameVerifier,
  type FrameSessionHandlers,
  type FrameSigner,
  type FrameVerifier,
  type ObpPersistence,
  runFrameSession,
  type SessionInit,
  type SessionOp,
} from "@cfd/obp-core";
import { checkpointFromOps, verifyExtends, type Checkpoint } from "@cfd/obp-session-sync";
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
  handlers?: Pick<FrameSessionHandlers, "onProliferate" | "onTerminate">;
  /** Multiplex `session_envelope` on the same stream after frames. */
  sessionEnvelopeSync?: boolean;
};

/**
 * Initiator: open HTTP/2 POST stream to an OBP reference server and run {@link runFrameSession}.
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
    const channel = await new Promise<ReturnType<typeof frameChannelFromClientStream>>((resolve, reject) => {
      client.on("error", reject);
      const req = client.request({ ":method": "POST", ":path": path });
      req.on("error", reject);
      resolve(frameChannelFromClientStream(req, () => client.close()));
    });

    const handlers: Pick<FrameSessionHandlers, "onProliferate" | "onTerminate"> = {
      ...(options.handlers?.onProliferate !== undefined
        ? { onProliferate: options.handlers.onProliferate }
        : {}),
      ...(options.handlers?.onTerminate !== undefined
        ? { onTerminate: options.handlers.onTerminate }
        : {}),
    };

    const sessionOps = await runFrameSession({
      role: "initiator",
      channel,
      signer: options.signer,
      verifier,
      persistence: options.persistence,
      ledgerSeq: options.ledgerSeq,
      init: options.init,
      handlers,
      ...(options.sessionEnvelopeSync === true
        ? {
            sessionEnvelopeSync: {
              myPartyId: options.init.party_ids[1],
              checkpointFromOps: (ops) => checkpointFromOps(ops as unknown[]),
              verifyExtends,
            },
          }
        : {}),
    });

    const checkpoint = checkpointFromOps(sessionOps);
    return { sessionOps, checkpoint };
  } finally {
    if (!client.destroyed) {
      client.close();
    }
  }
}
