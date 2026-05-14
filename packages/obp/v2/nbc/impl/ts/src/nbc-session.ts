/**
 * Bilateral NBC read helpers: bindable affordances and natural session stop.
 */

import type { Port } from "@khoralabs/obp-v2-model";
import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { isValidAtLedgerSeq } from "./nbc-invariants.ts";

export type BindablePortEntry = { portId: string; port: Port };

/**
 * Ports exposed on offers extended by **`counterpartyPartyId`**, valid at **`ledgerSeq`** (N1 on offer + port).
 */
export async function getBindablePortsForParty(
  counterpartyPartyId: string,
  client: ObpPersistenceClient,
  ledgerSeq: bigint,
): Promise<BindablePortEntry[]> {
  const { edges } = await client.listExposedPortEdges();
  const out: BindablePortEntry[] = [];
  for (const e of edges) {
    const ext = await client.getExtendingPartyId(e.offerId);
    if (ext !== counterpartyPartyId) continue;
    const { exposed } = await client.isPortExposed(e.portId);
    if (!exposed) continue;
    const port = await client.getPortOrNull(e.portId);
    if (!port) continue;
    if (!isValidAtLedgerSeq(port.expires_seq, ledgerSeq)) continue;
    const offer = await client.getOfferOrNull(e.offerId);
    if (!offer) continue;
    if (!isValidAtLedgerSeq(offer.expires_seq, ledgerSeq)) continue;
    out.push({ portId: e.portId, port });
  }
  return out;
}

/** `true` when any exposed port (with valid offer) is bindable at **`ledgerSeq`**. */
export async function isSessionAdvanceable(
  client: ObpPersistenceClient,
  ledgerSeq: bigint,
): Promise<boolean> {
  const { edges } = await client.listExposedPortEdges();
  for (const e of edges) {
    const { exposed } = await client.isPortExposed(e.portId);
    if (!exposed) continue;
    const port = await client.getPortOrNull(e.portId);
    if (!port) continue;
    if (!isValidAtLedgerSeq(port.expires_seq, ledgerSeq)) continue;
    const offer = await client.getOfferOrNull(e.offerId);
    if (!offer) continue;
    if (!isValidAtLedgerSeq(offer.expires_seq, ledgerSeq)) continue;
    return true;
  }
  return false;
}

/**
 * Natural bilateral stop: this turn added no new exposes **via `NbcTurnBody.ports`** **and** no prior exposed affordance remains bindable.
 *
 * **Coupling to `applyNbcTurn` (`nbc-turn.ts`):** that helper always runs **`ExtendOffer`** then **`ExposePort`** only for entries in **`body.ports`**. There is no “expose only on an existing offer” path—so **`currentTurnExposedPortCount`** should match **`body.ports.length`** (or **`exposedPortIds.length`** after apply). If a host adds other ways to expose ports without incrementing that count, this helper is **not** a sufficient end signal by itself.
 */
export async function nbcNaturalStop(
  currentTurnExposedPortCount: number,
  client: ObpPersistenceClient,
  ledgerSeq: bigint,
): Promise<boolean> {
  if (currentTurnExposedPortCount !== 0) return false;
  return !(await isSessionAdvanceable(client, ledgerSeq));
}
