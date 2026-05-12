import type { AtriumCliContext } from "../flows/context.ts";
import { boolFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

export async function runProbeListCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  const active = boolFlag(flags, "active");
  const probes = await ctx.client.listProbes({ active });
  console.log(JSON.stringify(probes, null, 2));
}
