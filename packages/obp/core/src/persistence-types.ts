import type { PortBindPolicy } from "./bind-policy/types.ts";
import type {
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
 * Storage strategy for OBP (Smithy {@code ObpPersistence} operations) plus minimal graph reads
 * so {@link ObpClient} can run pure invariant checks before mutating calls.
 *
 * The three helper methods are **not** separate Smithy RPCs; they expose implementation truth
 * for orchestration. Concrete adapters (e.g. memories-backed) implement them alongside the wire ops.
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

  /** All **BINDS** edges for capacity / ref resolution (canonical port) checks. */
  listBinds(): ReadonlyArray<{
    offerId: string;
    portId: string;
    counterparty_bind?: Record<string, unknown>;
    /** Snapshot of `port.bind_policy` at bind time (host extension). */
    bind_policy?: PortBindPolicy;
  }>;

  /** Snapshot of all ports keyed by id (ref resolution). */
  getPortsSnapshot(): ReadonlyMap<string, Port>;

  /**
   * Party id on the **EXTENDS** edge for this offer (who created the offer), or `null` if unknown.
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
