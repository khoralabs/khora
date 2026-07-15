import { AuthError } from "@khoralabs/khora-auth";
import {
  inboxWebSocketFromDuplexUtf8,
  popRelayInboxDrainItemsForDid,
  runInboxDuplexAttachment,
} from "@khoralabs/khora-host";
import type { DuplexByteStream } from "@khoralabs/khora-transport/byte-stream";
import type { HostRouteDeps } from "../http/deps";
import { KHORA_UNARY_INGRESS_ORIGIN } from "./unary-dispatch";

export async function attachInboxDuplexAfterAuth(opts: {
  deps: HostRouteDeps;
  duplex: DuplexByteStream;
  did: string;
  ts: string;
  nonce: string;
  sig: string;
}): Promise<{ dispose(): Promise<void> }> {
  const url = new URL(`${KHORA_UNARY_INGRESS_ORIGIN}/v1/inbox/ws`);
  url.searchParams.set("did", opts.did);
  url.searchParams.set("ts", opts.ts);
  url.searchParams.set("nonce", opts.nonce);
  url.searchParams.set("sig", opts.sig);

  const req = new Request(url.toString(), { method: "GET" });
  const { did: verifiedDid } = await opts.deps.ctx.auth.requireInboxAccess(req, url, []);

  const inboxRl = opts.deps.rateLimiters.inboxDid(`did:${verifiedDid}`);
  if (!inboxRl.ok) {
    throw new AuthError("Too many requests", 429);
  }

  const inboxHub = opts.deps.ctx.host.inboxHub;
  if (inboxHub === undefined) {
    throw new Error("khora-host: HostRuntime missing inboxHub");
  }

  const items = await popRelayInboxDrainItemsForDid(opts.deps.ctx, verifiedDid);
  const preSend = inboxWebSocketFromDuplexUtf8(opts.duplex);
  preSend.send(JSON.stringify({ type: "drain", items }));

  const { dispose } = await runInboxDuplexAttachment({
    inboxHub,
    did: verifiedDid,
    duplex: opts.duplex,
  });

  return { dispose };
}
