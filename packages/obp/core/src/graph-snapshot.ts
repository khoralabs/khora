import type { PortBindPolicy } from "./bind-policy/types.ts";
import type { ContentAddressedSourceRef } from "./model/types.ts";

/**
 * JSON-safe DAG view of an OBP session: parties, offers, ports, and the
 * EXTENDS / EXPOSES / BINDS edges that connect them.
 *
 * Hosts emit this shape from their persistence + `ObpClient`
 * and pass it to UIs, prompt formatters (often a compact subset), or
 * audit/replay tooling.
 *
 * When a port row includes **`bind_policy`**, binds supply **`counterparty_bind`** that must satisfy it for the bind to succeed.
 */
export type GraphSnapshot = {
  parties: Array<{ id: string; name: string }>;
  offers: Array<{
    id: string;
    type: string;
    partyId: string | null;
    partyName: string | null;
    expiresSeq: number;
    expired: boolean;
  }>;
  ports: Array<{
    id: string;
    type: string;
    promise: string;
    terminal: boolean;
    maxBindings: number;
    ref: string;
    bindCount: number;
    expiresSeq: number;
    expired: boolean;
    exposedOnOfferIds: string[];
    bind_policy?: PortBindPolicy;
  }>;
  extends: Array<{ partyId: string; offerId: string }>;
  exposes: Array<{ offerId: string; portId: string }>;
  binds: Array<{
    offerId: string;
    portId: string;
    content_receipts?: ContentAddressedSourceRef[];
    counterparty_bind?: Record<string, unknown>;
    bind_policy_snapshot?: PortBindPolicy;
  }>;
};
