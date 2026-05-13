import type { AtriumCliContext } from "../flows/context.ts";
import type { FlagMap } from "./types.ts";

export async function runProfileShowCommand(
  ctx: AtriumCliContext,
  did: string | undefined,
  _flags: FlagMap,
): Promise<void> {
  if (did === undefined || did.trim().length === 0) {
    throw new Error("usage: atrium profile show <did>");
  }
  const out = await ctx.client.lookupProfileByDid(did.trim());
  if (out === null) {
    throw new Error("profile not found");
  }
  console.log(JSON.stringify(out, null, 2));
}
