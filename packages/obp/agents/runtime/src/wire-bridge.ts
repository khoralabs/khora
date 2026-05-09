import type { TurnBody } from "@cfd/obp-core";

import type { NegotiationTurnAudit } from "./runtime.ts";

/**
 * Canonical wire payload recorded during finalize — avoids rebuilding TTL-bound exposes after commit.
 */
export function auditToTurnBody(audit: NegotiationTurnAudit, _rawOutput?: unknown): TurnBody {
  return audit.committedTurnBody;
}
