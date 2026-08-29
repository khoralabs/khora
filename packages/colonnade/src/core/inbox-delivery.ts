import type { FanOutTarget, GeneratedInboxRef, PointerRef, TenantKey } from "./colonnade-types";

/**
 * Delivers inbox pointers to fan-out targets.
 *
 * Intentionally agnostic to how pointers are written: a local adapter may open
 * per-principal cell DBs; at scale, adapters multiplex connections to cell nodes
 * or pools coordinated with a catalog host. Publication must not encode
 * open-per-recipient file semantics.
 */
export type InboxDelivery = {
  deliver(input: InboxDeliveryInput): Promise<InboxDeliveryResult>;
};

export type InboxDeliveryInput = {
  readonly pointer: PointerRef;
  readonly targets: readonly FanOutTarget[];
  readonly tenant_key: TenantKey;
};

export type InboxDeliveryResult = {
  readonly generated_inbox_refs: readonly GeneratedInboxRef[];
  /** Targets that failed with a retryable error (adapter-defined). */
  readonly failures?: readonly InboxDeliveryFailure[];
};

export type InboxDeliveryFailure = {
  readonly recipient_cell_id: string;
  readonly recipient_principal_id: string;
  readonly error: unknown;
  readonly retryable: boolean;
};
