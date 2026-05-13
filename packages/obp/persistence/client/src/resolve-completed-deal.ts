import type { OBPPersistenceClient } from "./obp-persistence-client.ts";
import type { ObpPersistence } from "./persistence-types.ts";

export type CompletedDeal = {
  offerId: string;
  portId: string;
  portType: string;
};

/**
 * A completed negotiation on the graph: a bind to a terminal port on an offer extended by `providerPartyId`.
 */
export function resolveCompletedDeal(
  client: OBPPersistenceClient,
  persistence: ObpPersistence,
  providerPartyId: string,
): CompletedDeal | null {
  for (const b of persistence.listBinds()) {
    if (client.getExtendingPartyId(b.offerId) !== providerPartyId) {
      continue;
    }
    const pr = client.getPort(b.portId);
    if (pr.kind === "notFound") {
      continue;
    }
    if (!pr.port.terminal) {
      continue;
    }
    return { offerId: b.offerId, portId: b.portId, portType: pr.port.type };
  }
  return null;
}
