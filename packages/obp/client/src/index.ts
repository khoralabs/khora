export type { SessionOp } from "@khoralabs/obp-core";
export type { Checkpoint, VerifyError } from "@khoralabs/obp-session-sync";
export { verifyExtends } from "@khoralabs/obp-session-sync";
export {
  connectObpSession,
  type ObpConnectOptions,
  type ObpFrameConnection,
  openObpHttp2Channel,
} from "./connect.ts";
export {
  connectObpFrameChannelSession,
  connectObpWebSocketSession,
  type ObpFrameChannelClientOptions,
  type ObpWebSocketConnectOptions,
} from "./connect-websocket.ts";
export { frameChannelFromClientStream } from "./http2-channel.ts";

import { connectObpSession } from "./connect.ts";
import { connectObpFrameChannelSession, connectObpWebSocketSession } from "./connect-websocket.ts";

/** Symmetry with `@khoralabs/obp-server` `Obp.serve`. */
export const Obp = {
  connect: connectObpSession,
  connectWebSocket: connectObpWebSocketSession,
  connectFrameChannel: connectObpFrameChannelSession,
};
