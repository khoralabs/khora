import type { FlagMap } from "@khoralabs/cli-kit";
import { promptChannelIdIfMissing } from "../flows/connect-flow";
import type { VellumCliContext } from "../flows/context";
import { makeVellumClient } from "../flows/context";

export async function handleConnect(
  ctx: VellumCliContext,
  positional: string[],
  flags: FlagMap,
  opts?: {
    /** Index into `positional` for `<channelId>` (`1` for `vellum connect`, `2` for `vellum channel connect`). */
    channelPositionalIndex?: number;
  },
): Promise<void> {
  const idx = opts?.channelPositionalIndex ?? 1;
  const fromPositional = positional[idx]?.trim();

  const channelId = await promptChannelIdIfMissing(ctx, flags, fromPositional);

  const client = makeVellumClient(flags, channelId);
  await client.connect();

  console.log("connected — vellum daemon started; control port in channel data dir (vellum.json)");
}
