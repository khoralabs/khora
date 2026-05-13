import { OBPPersistenceClient } from "@khoralabs/obp-persistence-client";
import { seedProfileCacheAfterRegister } from "../commands/register.ts";
import type { AtriumCliContext } from "./context.ts";
import { REGISTER_ROOT_OFFER, registerLinearTransitions } from "./graphs/register-linear.ts";
import { createMonotonicLedgerSeq } from "./obp/ledger-seq.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";

export async function runRegisterInteractiveFlow(ctx: AtriumCliContext): Promise<void> {
  const obp = new OBPPersistenceClient({ ledgerSeq: createMonotonicLedgerSeq() });
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: REGISTER_ROOT_OFFER,
    transitions: registerLinearTransitions,
    readLine: ctx.readLine,
  });

  const row = result.bindsByStep.register;
  if (row === undefined) {
    throw new Error("register: missing bind payload");
  }

  const username = row.username;
  const displayName = row["display-name"];
  const bio = row.bio;
  const inviteRaw = row["invite-token"];

  if (username === undefined || String(username).trim().length === 0) {
    throw new Error("register: username is required");
  }

  const out = await ctx.client.register({
    metadata: {
      username: String(username),
      ...(displayName !== undefined && String(displayName).length > 0
        ? { displayName: String(displayName) }
        : {}),
      ...(bio !== undefined && String(bio).length > 0 ? { bio: String(bio) } : {}),
    },
    ...(inviteRaw !== undefined && String(inviteRaw).trim().length > 0
      ? { inviteToken: String(inviteRaw).trim() }
      : {}),
  });

  seedProfileCacheAfterRegister(out.did, out.profile);

  console.log(JSON.stringify(out, null, 2));
}
