import type {
  BindListingRow,
  BindPortInput,
  ExposePortInput,
  ExtendOfferInput,
  GetOfferResult,
  GetPartyResult,
  GetPortResult,
  Offer,
  Party,
  Port,
  RegisterPartyInput,
} from "./model/types";

/**
 * Storage strategy for OBP: mirrors Smithy service **`ObpPersistence`** (`persistence.smithy`) including orchestration reads
 * (**`isPortExposed`**, **`listBinds`**, **`getPortsSnapshot`**, **`getExtendingPartyId`**) so {@link ObpClient} can run invariant checks before mutating calls.
 */
export interface ObpPersistence {
  registerParty(input: RegisterPartyInput): { party: Party };

  getParty(id: string): GetPartyResult;

  getOffer(id: string): GetOfferResult;

  getPort(id: string): GetPortResult;

  extendOffer(input: ExtendOfferInput): { offer: Offer };

  exposePort(input: ExposePortInput): { port: Port };

  bindPort(input: BindPortInput): void;

  /** True iff some Offer–Port **EXPOSES** edge targets this port id. */
  isPortExposed(portId: string): boolean;

  /** All **BINDS** rows (`BindListingRow` / Smithy **`BindListingRow`**). */
  listBinds(): ReadonlyArray<BindListingRow>;

  /** Snapshot of all ports keyed by id (ref resolution). */
  getPortsSnapshot(): ReadonlyMap<string, Port>;

  /**
   * Party id on the **EXTENDS** edge for this offer (who created the offer), or `null` if unknown
   * (Smithy **`GetExtendingPartyId`** uses empty string ↔ **`null`**).
   */
  getExtendingPartyId(offerId: string): string | null;

  /** All **EXPOSES** edges (offer id, port id) for enumerating bind/revoke surfaces. */
  listExposedPortEdges(): ReadonlyArray<{ offerId: string; portId: string }>;

  /** Set port `ts_expired` to `now` (revocation / soft-close). Caller enforces ownership policy. */
  setPortExpiredNow(portId: string): void;

  /**
   * Set offer `ts_expired` to `now` and cascade the same timestamp to all ports exposed on that offer.
   * Caller enforces ownership policy.
   */
  setOfferExpiredNow(offerId: string): void;
}
