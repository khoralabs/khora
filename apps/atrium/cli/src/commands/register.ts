import type { AtriumCliContext } from "../flows/context.ts";
import { runRegisterInteractiveFlow } from "../flows/register-flow.ts";
import { strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

function registerUseLegacy(flags: FlagMap): boolean {
  const did = strFlag(flags, "did");
  return did !== undefined && did.trim().length > 0;
}

export async function runRegisterCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  const { client } = ctx;
  if (registerUseLegacy(flags)) {
    const did = strFlag(flags, "did")?.trim() ?? "";
    const displayName = strFlag(flags, "display-name") ?? strFlag(flags, "displayName");
    const bio = strFlag(flags, "bio");
    const inviteToken = strFlag(flags, "invite-token") ?? strFlag(flags, "inviteToken");
    const metadata: Record<string, unknown> = {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(bio !== undefined ? { bio } : {}),
    };
    const result = await client.register({
      did,
      metadata,
      ...(inviteToken !== undefined && inviteToken.length > 0 ? { inviteToken } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  await runRegisterInteractiveFlow(ctx);
}
