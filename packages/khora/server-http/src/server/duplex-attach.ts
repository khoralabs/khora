import {
  handleInboxClientMessage,
  helloFrame,
  inboxWebSocketFromDuplexUtf8,
  newInboxConnectionId,
} from "@khoralabs/khora-host";
import type { DuplexByteStream } from "@khoralabs/khora-transport/byte-stream";
import type { HostRouteDeps } from "../http/deps";
import { inboxBindRateLimitGuard } from "../ws/inbox";

export async function attachInboxDuplexAfterAuth(opts: {
  deps: HostRouteDeps;
  duplex: DuplexByteStream;
}): Promise<{ dispose(): Promise<void> }> {
  const inboxHub = opts.deps.ctx.host.inboxHub;
  if (inboxHub === undefined) {
    throw new Error("khora-host: HostRuntime missing inboxHub");
  }

  const connectionId = newInboxConnectionId();
  const boundDids = new Set<string>();
  const inboxWs = inboxWebSocketFromDuplexUtf8(opts.duplex);
  inboxWs.send(helloFrame(connectionId));

  const allowBind = inboxBindRateLimitGuard(opts.deps.rateLimiters);
  const dec = new TextDecoder();
  let lineBuf = "";

  const pump = (async () => {
    try {
      for await (const chunk of opts.duplex.read()) {
        lineBuf += dec.decode(chunk, { stream: true });
        for (;;) {
          const nl = lineBuf.indexOf("\n");
          if (nl === -1) break;
          const line = lineBuf.slice(0, nl).replace(/\r$/, "").trim();
          lineBuf = lineBuf.slice(nl + 1);
          if (line.length === 0) continue;
          await handleInboxClientMessage({
            ctx: opts.deps.ctx,
            connectionId,
            boundDids,
            ws: inboxWs,
            inboxHub,
            raw: line,
            allowBind,
          });
        }
      }
    } catch {
      /* duplex closed / reset */
    } finally {
      inboxHub.removeSession(inboxWs);
      boundDids.clear();
    }
  })();

  return {
    dispose: async () => {
      await opts.duplex.close().catch(() => {});
      await pump.catch(() => {});
    },
  };
}
