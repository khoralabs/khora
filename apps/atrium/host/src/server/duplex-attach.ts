import { attachDuplexAsFrameChannelPeer, runInboxDuplexAttachment } from "@khoralabs/agent-relay";
import { AuthError } from "@khoralabs/atrium-auth";
import type { DuplexByteStream } from "@khoralabs/duplex-byte-stream";
import type { AtriumHostContext } from "../create-atrium-host.ts";
import type { HostRouteDeps } from "../http/deps.ts";
import { sendInboxSnapshot } from "../ws/inbox.ts";

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
  snapshotLimit: number;
}): Promise<{ dispose(): Promise<void> }> {
  const url = new URL("http://atrium.ipc/v1/inbox/ws");
  url.searchParams.set("did", opts.did);
  url.searchParams.set("ts", opts.ts);
  url.searchParams.set("nonce", opts.nonce);
  url.searchParams.set("sig", opts.sig);

  const req = new Request(url.toString(), { method: "GET" });
  let verifiedDid: string;
  try {
    ({ did: verifiedDid } = await opts.deps.ctx.auth.requireInboxAccess(req, url, []));
  } catch (e) {
    throw e;
  }

  const inboxRl = opts.deps.rateLimiters.inboxDid(`did:${verifiedDid}`);
  if (!inboxRl.ok) {
    throw new AuthError("Too many requests", 429);
  }

  const inboxHub = opts.deps.ctx.host.inboxHub;
  if (inboxHub === undefined) {
    throw new Error("Atrium: AgentRelay missing inboxHub");
  }

  const { inboxWs, dispose } = await runInboxDuplexAttachment({
    inboxHub,
    did: verifiedDid,
    duplex: opts.duplex,
  });

  await sendInboxSnapshot(inboxWs, verifiedDid, opts.deps.ctx, opts.snapshotLimit);

  return { dispose };
}
