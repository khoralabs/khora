import type { PortBindPolicy } from "@cfd/obp-core";

/**
 * JSON-safe DAG view of a negotiation: parties, offers, ports, and the
 * EXTENDS / EXPOSES / BINDS edges that connect them.
 *
 * Hosts emit this shape from their persistence + {@link import("@cfd/obp-core").ObpClient}
 * and pass it to UIs, prompt formatters ({@link GraphSnapshotForPrompt} is a
 * compact subset), or audit/replay tooling. The runtime itself does not
 * consume it directly — it is provided as a stable type so callers can build
 * snapshots without reinventing the field set.
 */
export type GraphSnapshot = {
  parties: Array<{ id: string; name: string }>;
  offers: Array<{
    id: string;
    type: string;
    partyId: string | null;
    partyName: string | null;
    tsExpired: number;
    expired: boolean;
  }>;
  ports: Array<{
    id: string;
    type: string;
    description: string;
    terminal: boolean;
    maxBindings: number;
    ref: string;
    bindCount: number;
    tsExpired: number;
    expired: boolean;
    exposedOnOfferIds: string[];
    bind_policy?: PortBindPolicy;
  }>;
  extends: Array<{ partyId: string; offerId: string }>;
  exposes: Array<{ offerId: string; portId: string }>;
  binds: Array<{
    offerId: string;
    portId: string;
    counterparty_bind?: Record<string, unknown>;
    bind_policy_snapshot?: PortBindPolicy;
  }>;
};
