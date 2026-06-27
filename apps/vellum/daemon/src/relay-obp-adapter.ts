import { openWebSocketNegotiationDuplex } from "@khoralabs/khora-transport";
import {
  connectObpFrameChannelSession,
  type ObpFrameConnection,
  type ObpWebSocketConnectOptions,
} from "@khoralabs/obp-transport-ws";

type ObpSessionResult = Awaited<ReturnType<typeof connectObpFrameChannelSession>>;

type ByteChannel = {
  read(): AsyncIterable<Uint8Array>;
  write(bytes: Uint8Array): Promise<void>;
  close(reason?: unknown): Promise<void>;
};

function webSocketUrlWithReplay(base: string, replayAfter?: number): string {
  if (replayAfter === undefined || !Number.isFinite(replayAfter)) return base;
  const u = new URL(base);
  u.searchParams.set("replayAfter", String(replayAfter));
  return u.toString();
}

/**
 * Wrap a DuplexByteStream so that init frames for sessions in `ownedIds` are
 * dropped from the read side. The relay broadcasts every frame to all channel
 * members including the sender, so outbound inits echo back — the multiplex
 * must not see them as inbound peer-initiated sessions.
 */
function filterEchoedInits(inner: ByteChannel, ownedIds: Set<string>): ByteChannel {
  return {
    async *read() {
      for await (const chunk of inner.read()) {
        if (ownedIds.size > 0) {
          try {
            const text = new TextDecoder().decode(chunk);
            const parsed = JSON.parse(text) as unknown;
            if (
              parsed !== null &&
              typeof parsed === "object" &&
              "init" in parsed &&
              parsed.init !== null &&
              typeof parsed.init === "object" &&
              "session_id" in parsed.init &&
              typeof (parsed.init as Record<string, unknown>).session_id === "string" &&
              ownedIds.has((parsed.init as Record<string, unknown>).session_id as string)
            ) {
              continue; // drop echoed init
            }
          } catch {
            // not JSON or malformed — pass through and let the multiplex handle it
          }
        }
        yield chunk;
      }
    },
    write: (bytes: Uint8Array) => inner.write(bytes),
    close: (reason?: unknown) => inner.close(reason),
  };
}

export async function connectObpOverRelay(
  options: Omit<ObpWebSocketConnectOptions, "channel" | "WebSocketCtor"> & {
    WebSocketCtor?: typeof WebSocket;
    replayAfter?: number;
  },
  runner: (conn: ObpFrameConnection) => Promise<void>,
): Promise<ObpSessionResult> {
  const { webSocketUrl, webSocketProtocols, WebSocketCtor, replayAfter, ...rest } = options;
  const handle = await openWebSocketNegotiationDuplex({
    webSocketUrl: webSocketUrlWithReplay(webSocketUrl, replayAfter),
    webSocketProtocols,
    WebSocketCtor: WebSocketCtor ?? WebSocket,
  });

  // Track session IDs this node initiates so their relay echoes can be dropped.
  const ownedSessionIds = new Set<string>();
  const filteredChannel = filterEchoedInits(handle.channel, ownedSessionIds);

  const wrappedRunner = async (conn: ObpFrameConnection): Promise<void> => {
    const interceptedConn: ObpFrameConnection = {
      async init(init, hooks) {
        const handle = await conn.init(init, hooks);
        // Record after a successful init so the echo filter knows to drop it.
        ownedSessionIds.add(init.session_id);
        return handle;
      },
      close: () => conn.close(),
    };
    await runner(interceptedConn);
  };

  try {
    return await connectObpFrameChannelSession(
      { ...rest, channel: filteredChannel },
      wrappedRunner,
    );
  } finally {
    handle.dispose();
  }
}
