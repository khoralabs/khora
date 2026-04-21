import type { ObpClient, Port } from "@cfd/obp-core";

/** One dynamic bind tool entry (host fills each turn). */
export type ObpNegotiationBindChoice = {
  toolName: string;
  description: string;
  offerId: string;
  portId: string;
};

/** Revoke a single exposed port (expiry set to now). */
export type ObpNegotiationRevokePortChoice = {
  toolName: string;
  description: string;
  offerId: string;
  portId: string;
};

/** Revoke a whole offer (expiry + cascade to exposed ports). */
export type ObpNegotiationRevokeOfferChoice = {
  toolName: string;
  description: string;
  offerId: string;
};

/**
 * Host-computed per-turn choices for contextual bind/revoke tools.
 * Omit or leave empty when only structural tools (extend/expose/end) are needed.
 */
export type ObpNegotiationToolContext = {
  bindChoices: ObpNegotiationBindChoice[];
  revokePortChoices: ObpNegotiationRevokePortChoice[];
  revokeOfferChoices: ObpNegotiationRevokeOfferChoice[];
};

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
   * If omitted, bind paths only enforce structural checks ({@link ObpClient.bindPort}).
   */
  validateBind?: (ctx: ObpBindValidationContext) => void | Promise<void>;
  /**
   * When set, {@link obpEndNegotiationTool} signals the host to stop the negotiation (demo/session orchestration).
   */
  requestNegotiationEnd?: (args: { reason?: string }) => void;
  /**
   * Per-turn bind/revoke tool definitions for the dynamic negotiation toolkit member. Host sets ids and descriptions.
   */
  negotiationToolContext?: ObpNegotiationToolContext;
};
