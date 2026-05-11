import type { AtriumCliContext } from "./context.ts";

export async function runHealthFlow(ctx: AtriumCliContext): Promise<void> {
  console.log(JSON.stringify(await ctx.client.health(), null, 2));
}
