export { connectObpSession, type ObpConnectOptions } from "./connect.ts";
export { frameChannelFromClientStream } from "./http2-channel.ts";
export type { Checkpoint, VerifyError } from "@cfd/obp-session-sync";
export { verifyExtends } from "@cfd/obp-session-sync";
export type { SessionOp } from "@cfd/obp-core";

import { connectObpSession } from "./connect.ts";

/** Symmetry with `@cfd/obp-server` `Obp.serve`. */
export const Obp = {
  connect: connectObpSession,
};
