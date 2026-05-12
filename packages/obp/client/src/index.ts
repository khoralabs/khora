export type { SessionOp } from "@khoralabs/obp-core";
export type { Checkpoint, VerifyError } from "@khoralabs/obp-session-sync";
export { verifyExtends } from "@khoralabs/obp-session-sync";
export {
  connectObpSession,
  type ObpConnectOptions,
  type ObpFrameConnection,
  openObpHttp2Channel,
} from "./connect.ts";
export { frameChannelFromClientStream } from "./http2-channel.ts";

import { connectObpSession } from "./connect.ts";

/** Symmetry with `@khoralabs/obp-server` `Obp.serve`. */
export const Obp = {
  connect: connectObpSession,
};
