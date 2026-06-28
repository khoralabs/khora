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
 *
 * Returns the channel and a `getFrameCount()` getter that counts frames passed
 * to the caller (excluding dropped echoes). The count can be added to the
 * initial `lastBlobId` to estimate the relay's current position for incremental
 * reconnect via `replayAfter`.
 */
function filterEchoedInits(
  inner: ByteChannel,
  ownedIds: Set<string>,
): { channel: ByteChannel; getFrameCount: () => number } {
  let frameCount = 0;
  const channel: ByteChannel = {
    async *read() {
      for await (const chunk of inner.read()) {
        if (ownedIds.size > 0) {
          try {
            // OBP wire format: uint32_be(length) followed by JSON payload.
            // Must skip the 4-byte length prefix before parsing JSON.
            if (chunk.length > 4) {
              const text = new TextDecoder().decode(chunk.subarray(4));
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
            }
          } catch {
            // not JSON or malformed — pass through and let the multiplex handle it
          }
        }
        frameCount++;
        yield chunk;
      }
    },
    write: (bytes: Uint8Array) => inner.write(bytes),
    close: (reason?: unknown) => inner.close(reason),
  };
  return { channel, getFrameCount: () => frameCount };
}

export async function connectObpOverRelay(
  options: Omit<ObpWebSocketConnectOptions, "channel" | "WebSocketCtor"> & {
    WebSocketCtor?: typeof WebSocket;
    replayAfter?: number;
  },
  runner: (conn: ObpFrameConnection, getFrameCount: () => number) => Promise<void>,
): Promise<ObpSessionResult> {
  const { webSocketUrl, webSocketProtocols, WebSocketCtor, replayAfter, ...rest } = options;
  const handle = await openWebSocketNegotiationDuplex({
    webSocketUrl: webSocketUrlWithReplay(webSocketUrl, replayAfter),
    webSocketProtocols,
    WebSocketCtor: WebSocketCtor ?? WebSocket,
  });

  // Track session IDs this node initiates so their relay echoes can be dropped.
  const ownedSessionIds = new Set<string>();
  const { channel: filteredChannel, getFrameCount } = filterEchoedInits(
    handle.channel,
    ownedSessionIds,
  );

  const wrappedRunner = async (conn: ObpFrameConnection): Promise<void> => {
    const interceptedConn: ObpFrameConnection = {
      async init(init, hooks) {
        // Register before sending so the filter is ready when the relay echo arrives.
        ownedSessionIds.add(init.session_id);
        try {
          return await conn.init(init, hooks);
        } catch (e) {
          ownedSessionIds.delete(init.session_id);
          throw e;
        }
      },
      close: () => conn.close(),
    };
    await runner(interceptedConn, getFrameCount);
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
