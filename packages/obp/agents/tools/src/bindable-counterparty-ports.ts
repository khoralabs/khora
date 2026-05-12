import type { OBPPersistenceClient, ObpPersistence } from "@khoralabs/obp-core";
import { validateBindPreconditions } from "@khoralabs/obp-core";
import { parsePriceFromType } from "./encoding.ts";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";

/** One counterparty-offered port the acting party may bind (structural + optional policy checks). */
export type BindableCounterpartyPort = {
  offerId: string;
  portId: string;
  offerOwnerPartyId: string;
};

/**
 * Lists exposed counterparty ports the acting party may bind, using the same preconditions as
 * {@link computeNegotiationContext} bind tools (without dynamic tool metadata).
 */
export async function listBindableCounterpartyPorts(args: {
  client: OBPPersistenceClient;
  persistence: ObpPersistence;
  actingPartyId: string;
  ledgerSeq: number;
  validateBind?: ObpToolkitEnv["validateBind"];
}): Promise<BindableCounterpartyPort[]> {
  const { client, persistence, actingPartyId, ledgerSeq, validateBind } = args;
  const out: BindableCounterpartyPort[] = [];
  const edges = client.listExposedPortEdges();
  const portsById = persistence.getPortsSnapshot();
  const binds = persistence.listBinds();

  for (const { offerId, portId } of edges) {
    const owner = client.getExtendingPartyId(offerId);
    const offerRes = client.getOffer(offerId);
    const portRes = client.getPort(portId);
    if (offerRes.kind === "notFound" || portRes.kind === "notFound" || owner === null) {
      continue;
    }
    if (owner === actingPartyId) {
      continue;
    }
    const offer = offerRes.offer;
    const port = portRes.port;

    const fail = validateBindPreconditions({
      ledgerSeq,
      offer,
      port,
      portsById,
      targetPortIsExposed: persistence.isPortExposed(portId),
      binds,
    });
    if (fail !== null) {
      continue;
    }

    if (validateBind) {
      try {
        await validateBind({
          actingPartyId,
          offerId,
          portId,
          offerOwnerPartyId: owner,
          port,
          price: parsePriceFromType(port.type),
        });
      } catch {
        continue;
      }
    }

    out.push({ offerId, portId, offerOwnerPartyId: owner });
  }

  return out;
}

/** Pick the newest counterparty offer (by **`created_seq`**) among the given bindable rows. */
export function newestOfferIdAmongBindable(
  client: OBPPersistenceClient,
  bindable: ReadonlyArray<Pick<BindableCounterpartyPort, "offerId">>,
): string | null {
  let best: { offerId: string; seq: number } | null = null;
  for (const { offerId } of bindable) {
    const r = client.getOffer(offerId);
    if (r.kind === "notFound") {
      continue;
    }
    const seq = r.offer.created_seq;
    if (best === null || seq > best.seq) {
      best = { offerId, seq };
    }
  }
  return best?.offerId ?? null;
}
