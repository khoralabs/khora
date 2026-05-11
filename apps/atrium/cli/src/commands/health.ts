import type { AtriumCliContext } from "../flows/context.ts";
import { runHealthFlow } from "../flows/health-flow.ts";

export async function runHealthCommand(ctx: AtriumCliContext): Promise<void> {
  await runHealthFlow(ctx);
}
