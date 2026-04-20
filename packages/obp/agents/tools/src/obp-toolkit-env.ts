import type { ObpClient, Port } from "@cfd/obp-core";

/** Inclusive numeric band for optional price checks (domain-defined semantics). */
export type PriceBand = {
  min: number;
  max: number;
};

/**
 * Context for optional {@link ObpToolkitEnv.validateBind}; throw to reject the bind.
 */
export type ObpBindValidationContext = {
  actingPartyId: string;
  offerId: string;
  portId: string;
  /** Party on the EXTENDS edge for the offer, if any. */
  offerOwnerPartyId: string | null;
  port: Port;
  /** From encoded port type, if parseable. */
  price: number | null;
};

/**
 * Session env for OBP coordination tools: {@link ObpClient}, clock, acting party, optional bind policy.
 */
export type ObpToolkitEnv = {
  client: ObpClient;
  now: () => number;
  /** Party id for {@link obp_extend_offer} and ownership checks on {@link obp_expose_port}. */
  actingPartyId: string;
  /**
   * Domain rules for who may bind to which offer/port and optional price acceptance.
   * If omitted, {@link obp_bind_port} only enforces structural checks (terminal port, then {@link ObpClient.bindPort}).
   */
  validateBind?: (ctx: ObpBindValidationContext) => void | Promise<void>;
  /**
   * When set, {@link obpEndNegotiationTool} signals the host to stop the negotiation (demo/session orchestration).
   */
  requestNegotiationEnd?: (args: { reason?: string }) => void;
};
