export type { SessionOp } from "@cfd/obp-core";
export type { Checkpoint, VerifyError } from "@cfd/obp-session-sync";
export { verifyExtends } from "@cfd/obp-session-sync";
export { connectObpSession, type ObpConnectOptions, openObpHttp2Channel } from "./connect.ts";
export { frameChannelFromClientStream } from "./http2-channel.ts";

import { connectObpSession } from "./connect.ts";

/** Symmetry with `@cfd/obp-server` `Obp.serve`. */
export const Obp = {
  connect: connectObpSession,
};
