import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";

import { makeVellumClient, type VellumCliContext } from "../flows/context.ts";
import { promptRoomIdIfMissing } from "../flows/connect-flow.ts";

export async function handleConnect(
  ctx: VellumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const roomId = await promptRoomIdIfMissing(ctx, flags, positional[1]);

  const client = makeVellumClient(flags, roomId);
  const ws = strFlag(flags, "ws-url") ?? strFlag(flags, "wsUrl");
  await client.connect(ws !== undefined && ws.length > 0 ? { webSocketUrl: ws } : undefined);
  console.log(
    "connected — vellum daemon started; control port in room data dir (vellum.json)",
  );
}
