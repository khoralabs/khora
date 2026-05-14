import type { OutgoingHttpHeaders } from "node:http";
import http2 from "node:http2";
import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import { ObpError } from "@khoralabs/obp-v2-errors";
import {
  createEd25519FrameVerifier,
  defaultSessionEnvelopeSyncAdapter,
  type FrameMultiplexOpenerApi,
  type FrameSigner,
  type FrameVerifier,
  normalizeSessionInit,
  partyIdForSigner,
  runFrameMultiplexSession,
  type SessionInitNormalized,
} from "@khoralabs/obp-v2-frames-impl";
import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import {
  type Checkpoint,
  checkpointForSessionOps,
  type SessionOp,
} from "@khoralabs/obp-v2-session-impl";

import { frameChannelFromClientStream } from "./http2-channel.ts";

export type ObpFrameConnection = FrameMultiplexOpenerApi;

function postPathFromObpEndpointUrl(u: URL): string {
  const path = u.pathname === "/" || u.pathname === "" ? "/obp/v1" : u.pathname;
  return `${path}${u.search}`;
}

export async function openObpHttp2Channel(
  endpointUrl: string,
): Promise<{ channel: DuplexByteStream; closeHttp2: () => void }> {
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
      channel: frameChannelFromClientStream(req, () => {
        if (!client.destroyed) client.close();
      }),
      closeHttp2: () => {
        if (!client.destroyed) client.close();
      },
    });
  });
}

export type ObpConnectOptions = {
  url: string;
  requestHeaders?: OutgoingHttpHeaders;
  signer: FrameSigner;
  verifier?: FrameVerifier;
  client: ObpPersistenceClient;
  ledgerSeq: () => number;
  sessionEnvelopeSync?: boolean;
};

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

  const http2Client = http2.connect(connectUrl);
  try {
    const channel = await new Promise<DuplexByteStream>((resolve, reject) => {
      http2Client.on("error", reject);
      const req = http2Client.request({
        ":method": "POST",
        ":path": postPath,
        ...(options.requestHeaders ?? {}),
      });
      req.on("error", reject);
      resolve(
        frameChannelFromClientStream(req, () => {
          if (!http2Client.destroyed) http2Client.close();
        }),
      );
    });

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

    const sessionOps = await runFrameMultiplexSession({
      channel,
      signer: options.signer,
      verifier,
      client: options.client,
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

    const checkpoint = checkpointForSessionOps(sessionOps);
    return { sessionOps, checkpoint };
  } finally {
    if (!http2Client.destroyed) {
      http2Client.close();
    }
  }
}
