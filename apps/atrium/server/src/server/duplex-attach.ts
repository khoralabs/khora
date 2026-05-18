import {
  attachDuplexAsFrameChannelPeer,
  inboxWebSocketFromDuplexUtf8,
  runInboxDuplexAttachment,
} from "@khoralabs/agent-relay";
import { AuthError } from "@khoralabs/at2-auth";
import { type AtriumHostContext, popRelayInboxDrainItemsForDid } from "@khoralabs/at2-host";
import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import type { HostRouteDeps } from "../http/deps.ts";
import { ATRIUM_UNARY_INGRESS_ORIGIN } from "./unary-dispatch.ts";

export async function attachRoomDuplexAfterTicket(opts: {
  ctx: AtriumHostContext;
  roomId: string;
  ticket: string;
  duplex: DuplexByteStream;
}): Promise<{ dispose(): Promise<void> }> {
  const ok = await opts.ctx.roomHub.verifyTicket(opts.roomId, opts.ticket);
  if (!ok) {
    throw new AuthError("Invalid or expired ticket", 401);
  }
  const { dispose } = await attachDuplexAsFrameChannelPeer(
    opts.ctx.roomHub,
    opts.roomId,
    opts.duplex,
  );
  return { dispose };
}

export async function attachInboxDuplexAfterAuth(opts: {
  deps: HostRouteDeps;
  duplex: DuplexByteStream;
  did: string;
  ts: string;
  nonce: string;
  sig: string;
}): Promise<{ dispose(): Promise<void> }> {
  const url = new URL(`${ATRIUM_UNARY_INGRESS_ORIGIN}/v1/inbox/ws`);
  url.searchParams.set("did", opts.did);
  url.searchParams.set("ts", opts.ts);
  url.searchParams.set("nonce", opts.nonce);
  url.searchParams.set("sig", opts.sig);

  const req = new Request(url.toString(), { method: "GET" });
  let verifiedDid: string;
  ({ did: verifiedDid } = await opts.deps.ctx.auth.requireInboxAccess(req, url, []));

  const inboxRl = opts.deps.rateLimiters.inboxDid(`did:${verifiedDid}`);
  if (!inboxRl.ok) {
    throw new AuthError("Too many requests", 429);
  }

  const inboxHub = opts.deps.ctx.host.inboxHub;
  if (inboxHub === undefined) {
    throw new Error("at2-host: AgentRelay missing inboxHub");
  }

  const items = popRelayInboxDrainItemsForDid(opts.deps.ctx, verifiedDid);
  const preSend = inboxWebSocketFromDuplexUtf8(opts.duplex);
  preSend.send(JSON.stringify({ type: "drain", items }));

  const { dispose } = await runInboxDuplexAttachment({
    inboxHub,
    did: verifiedDid,
    duplex: opts.duplex,
  });

  return { dispose };
}
