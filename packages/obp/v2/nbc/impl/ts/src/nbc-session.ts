/**
 * Bilateral NBC read helpers: bindable affordances and natural session stop.
 */

import type { Port } from "@khoralabs/obp-v2-model";
import type { ObpPersistenceClient, ObpNbcBindWindow } from "@khoralabs/obp-v2-persistence";
import { type NbcBindTiming, isRelayExpiryOk, isTurnExpiryOk } from "./nbc-invariants.ts";

export type BindablePortEntry = { portId: string; port: Port };

function isNbcWindowBindableAt(w: ObpNbcBindWindow, t: NbcBindTiming): boolean {
  return (
    isTurnExpiryOk(w.nbc_expires_turn, t.turnSeq) &&
    isRelayExpiryOk(w.nbc_expires_at_relay_ms, t.relayTsMs)
  );
}

/**
 * Ports exposed on offers extended by **`counterpartyPartyId`**, valid at **`timing`** (N1 on offer + port bind windows).
 */
export async function getBindablePortsForParty(
  counterpartyPartyId: string,
  client: ObpPersistenceClient,
  timing: NbcBindTiming,
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
    const portWin = await client.getNbcBindWindowForPortOrNull(e.portId);
    if (!portWin) continue;
    if (!isNbcWindowBindableAt(portWin, timing)) continue;
    const offerWin = await client.getNbcBindWindowForOfferOrNull(e.offerId);
    if (!offerWin) continue;
    if (!isNbcWindowBindableAt(offerWin, timing)) continue;
    out.push({ portId: e.portId, port });
  }
  return out;
}

/** `true` when any exposed port (with valid offer bind window) is bindable at **`timing`**. */
export async function isSessionAdvanceable(
  client: ObpPersistenceClient,
  timing: NbcBindTiming,
): Promise<boolean> {
  const { edges } = await client.listExposedPortEdges();
  for (const e of edges) {
    const { exposed } = await client.isPortExposed(e.portId);
    if (!exposed) continue;
    const port = await client.getPortOrNull(e.portId);
    if (!port) continue;
    const portWin = await client.getNbcBindWindowForPortOrNull(e.portId);
    if (!portWin) continue;
    if (!isNbcWindowBindableAt(portWin, timing)) continue;
    const offerWin = await client.getNbcBindWindowForOfferOrNull(e.offerId);
    if (!offerWin) continue;
    if (!isNbcWindowBindableAt(offerWin, timing)) continue;
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
  timing: NbcBindTiming,
): Promise<boolean> {
  if (currentTurnExposedPortCount !== 0) return false;
  return !(await isSessionAdvanceable(client, timing));
}
