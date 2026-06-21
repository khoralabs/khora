import type { Database } from "bun:sqlite";

import type { InviteEffects } from "@shared/invites/effects";
import { entitle } from "../authz/entitlements";
import { grant } from "../authz/grants";
import { accountScope } from "../authz/policy";

export function applyInviteEffects(db: Database, userId: string, effects: InviteEffects): void {
  const scope = accountScope(userId);
  for (const grantEffect of effects.grants) {
    grant(
      db,
      scope,
      { type: grantEffect.resourceType, id: grantEffect.resourceId },
      grantEffect.feature,
    );
  }
  for (const entitlement of effects.entitlements) {
    entitle(db, scope, entitlement.feature);
  }
}
