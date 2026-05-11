import type { AtriumCliContext } from "../flows/context.ts";
import { runInboxListInteractiveFlow } from "../flows/inbox-list-flow.ts";
import { boolFlag, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

function inboxUseLegacy(flags: FlagMap): boolean {
  return strFlag(flags, "limit") !== undefined || boolFlag(flags, "mark-read", "markRead");
}

export async function runInboxListCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  const { client } = ctx;
  if (inboxUseLegacy(flags)) {
    const limitRaw = strFlag(flags, "limit");
    const limit = limitRaw !== undefined ? Number.parseInt(limitRaw, 10) : undefined;
    if (limitRaw !== undefined && Number.isNaN(limit)) {
      console.error("inbox list: --limit must be a number");
      process.exit(1);
    }
    const markRead = boolFlag(flags, "mark-read", "markRead");
    const out = await client.listInbox({ limit, markRead });
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  await runInboxListInteractiveFlow(ctx);
}
