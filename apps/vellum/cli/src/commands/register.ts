import type { FlagMap } from "@khoralabs/cli-kit";
import { strFlag } from "@khoralabs/cli-kit";
import { KhoraClient } from "@khoralabs/khora-client";

import { cliBaseUrl, loadSigner, type VellumCliContext } from "../flows/context.ts";
import { runRegisterInteractiveFlow } from "../flows/register-flow.ts";

export async function handleRegister(ctx: VellumCliContext, flags: FlagMap): Promise<void> {
  const baseUrl = cliBaseUrl(flags);
  const u = strFlag(flags, "username")?.trim() ?? "";
  const d = (strFlag(flags, "display-name") ?? strFlag(flags, "displayName"))?.trim() ?? "";

  let username = u;
  let displayName = d;
  let inviteToken = strFlag(flags, "invite-token") ?? strFlag(flags, "inviteToken");

  const hasUsernameFlag = flags.username !== undefined;
  const hasDisplayFlag = flags["display-name"] !== undefined || flags.displayName !== undefined;
  const nonInteractiveOk =
    hasUsernameFlag && hasDisplayFlag && username.length > 0 && displayName.length > 0;

  if (!nonInteractiveOk) {
    const prompted = await runRegisterInteractiveFlow(ctx, {
      ...(username.length > 0 ? { username } : {}),
      ...(displayName.length > 0 ? { displayName } : {}),
    });
    username = prompted.username;
    displayName = prompted.displayName;
    if (prompted.inviteToken !== undefined) {
      inviteToken = prompted.inviteToken;
    }
  }

  const signer = await loadSigner(flags);
  const ac = new KhoraClient({ baseUrl, signer });
  try {
    const out = await ac.register({
      metadata: { username, displayName },
      ...(inviteToken !== undefined && inviteToken.length > 0 ? { inviteToken } : {}),
    });
    console.log(JSON.stringify(out, null, 2));
  } finally {
    ac.dispose();
  }
}
