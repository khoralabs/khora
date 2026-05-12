import { formatHashShort } from "@khoralabs/agent-identity";

/**
 * Human label first; then a short `invocationHash` slice (unique per user/persona when
 * `invocationContext` encodes them); else `formatHashShort(agentId)` (per-seat) while
 * invocation is not available.
 */
export function resolveMatchmakingNegotiatorDisplayName(args: {
  displayLabel: string;
  invocationHash?: string;
  agentId: string;
}): string {
  const t = args.displayLabel.trim();
  if (t.length > 0) {
    return t;
  }
  if (args.invocationHash) {
    return `peer-${formatHashShort(args.invocationHash)}`;
  }
  return `agent-${formatHashShort(args.agentId)}`;
}
