import type { JsonDocument } from "@khoralabs/obp-model";

import type { FlowPort } from "./flow-types";

/**
 * Read-only view of “the chain” for a CLI session: existing binds and effective policy per port.
 * Hosts (e.g. vellum) implement this against persistence or an in-memory stub.
 */
export type FlowChainView = {
  /** Effective JSON Schema (or empty) for validating readline input for this port. */
  resolveBindPolicy(offerId: string, port: FlowPort): JsonDocument | null;
  /** Prior string value for this port if already satisfied on the chain. */
  existingStringValue(offerId: string, portId: string): string | undefined;
};
