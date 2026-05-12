import { zAtriumProfilePatch } from "@khoralabs/atrium-contracts";
import { OBPPersistenceClient } from "@khoralabs/obp-core";
import type { AtriumCliContext } from "./context.ts";
import {
  PROFILE_UPDATE_ROOT,
  profileUpdateLinearTransitions,
} from "./graphs/profile-update-linear.ts";
import { createMonotonicLedgerSeq } from "./obp/ledger-seq.ts";
import { runLinearObpFlow } from "./obp/linear-runner.ts";

export async function runProfileUpdateInteractiveFlow(ctx: AtriumCliContext): Promise<void> {
  const obp = new OBPPersistenceClient({ ledgerSeq: createMonotonicLedgerSeq() });
  const result = await runLinearObpFlow({
    obp,
    partyName: "atrium-cli",
    rootOfferType: PROFILE_UPDATE_ROOT,
    transitions: profileUpdateLinearTransitions,
    readLine: ctx.readLine,
  });

  const row = result.bindsByStep.profile;
  if (row === undefined) {
    throw new Error("profile: missing bind payload");
  }

  const patch = zAtriumProfilePatch.parse({
    ...(row["display-name"] !== undefined && String(row["display-name"]).trim().length > 0
      ? { displayName: String(row["display-name"]).trim() }
      : {}),
    ...(row.bio !== undefined && String(row.bio).trim().length > 0
      ? { bio: String(row.bio).trim() }
      : {}),
  });

  if (Object.keys(patch).length === 0) {
    throw new Error("Provide at least one of display name or bio.");
  }

  const profile = await ctx.client.updateProfile(patch);
  console.log(JSON.stringify(profile, null, 2));
}
