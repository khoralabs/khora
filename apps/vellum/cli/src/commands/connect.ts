import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";
import { promptRoomIdIfMissing } from "../flows/connect-flow.ts";
import { makeVellumClient, type VellumCliContext } from "../flows/context.ts";

export type HandleConnectOptions = {
  /** Index into `positional` for `<roomId>` (`1` for `vellum connect`, `2` for `vellum room connect`). */
  roomPositionalIndex?: number;
};

export async function handleConnect(
  ctx: VellumCliContext,
  positional: string[],
  flags: FlagMap,
  opts?: HandleConnectOptions,
): Promise<void> {
  const idx = opts?.roomPositionalIndex ?? 1;
  const slot = positional[idx];
  const fromPositional = slot !== undefined && slot.trim().length > 0 ? slot.trim() : undefined;
  const roomId = await promptRoomIdIfMissing(ctx, flags, fromPositional);

  const client = makeVellumClient(flags, roomId);
  const ws = strFlag(flags, "ws-url") ?? strFlag(flags, "wsUrl");
  await client.connect(ws !== undefined && ws.length > 0 ? { webSocketUrl: ws } : undefined);
  console.log("connected — vellum daemon started; control port in room data dir (vellum.json)");
}
