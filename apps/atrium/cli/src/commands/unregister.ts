import { boolFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";
import type { AtriumCliContext } from "../flows/context.ts";

/** `atrium unregister` — signed `POST /v1/unregister`; requires `--yes` to confirm. */
export async function runUnregisterCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  if (!boolFlag(flags, "yes", "y")) {
    console.error("unregister: refusing without --yes (this deletes your account on the host)");
    process.exit(1);
  }
  await ctx.client.unregister();
  console.log("Unregistered on host (server-side account data removed).");
}
