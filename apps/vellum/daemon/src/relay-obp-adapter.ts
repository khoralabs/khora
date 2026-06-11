import { openWebSocketNegotiationDuplex } from "@khoralabs/khora-transport";
import {
  connectObpFrameChannelSession,
  type ObpFrameConnection,
  type ObpWebSocketConnectOptions,
} from "@khoralabs/obp-transport-ws";

type ObpSessionResult = Awaited<ReturnType<typeof connectObpFrameChannelSession>>;

function webSocketUrlWithReplay(base: string, replayAfter?: number): string {
  if (replayAfter === undefined || !Number.isFinite(replayAfter)) return base;
  const u = new URL(base);
  u.searchParams.set("replayAfter", String(replayAfter));
  return u.toString();
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
  try {
    return await connectObpFrameChannelSession({ ...rest, channel: handle.channel }, runner);
  } finally {
    handle.dispose();
  }
}
