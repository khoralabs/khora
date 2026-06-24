import type { Database } from "bun:sqlite";

import type { InviteEffects } from "@shared/invites/effects";
import { accountScope } from "../authz/policy";
import { requireAuthzServiceClient } from "../authz/service-client";

export async function applyInviteEffects(
  _db: Database,
  userId: string,
  effects: InviteEffects,
): Promise<void> {
  const client = requireAuthzServiceClient();
  const scope = accountScope(userId);
  for (const grantEffect of effects.grants) {
    await client.grant({
      scope,
      resource: { type: grantEffect.resourceType, id: grantEffect.resourceId },
      feature: grantEffect.feature,
    });
  }
}
