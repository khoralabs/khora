import { openWebSocketNegotiationDuplex } from "@khoralabs/khora-transport";
import {
  connectObpFrameChannelSession,
  type ObpFrameConnection,
  type ObpWebSocketConnectOptions,
} from "@khoralabs/obp-transport-ws";

type ObpSessionResult = Awaited<ReturnType<typeof connectObpFrameChannelSession>>;

export async function connectObpOverRelay(
  options: Omit<ObpWebSocketConnectOptions, "channel" | "WebSocketCtor"> & {
    WebSocketCtor?: typeof WebSocket;
  },
  runner: (conn: ObpFrameConnection) => Promise<void>,
): Promise<ObpSessionResult> {
  const { webSocketUrl, webSocketProtocols, WebSocketCtor, ...rest } = options;
  const handle = await openWebSocketNegotiationDuplex({
    webSocketUrl,
    webSocketProtocols,
    WebSocketCtor: WebSocketCtor ?? WebSocket,
  });
  try {
    return await connectObpFrameChannelSession({ ...rest, channel: handle.channel }, runner);
  } finally {
    handle.dispose();
  }
}
