/**
 * Structural match for `@cfd/obp-core` `SessionInitWire` (registration / bearer invites).
 * Assign values produced by that package without importing it here (keeps this package’s typecheck isolated).
 */
export type RegistrationSessionWire = {
  session_id: string;
  party_ids: [string, string];
  actor_pubkeys: [string, string];
  genesis_hash: string;
};

/**
 * Session-bound registration proof aligned with `verifyInvite` and obp-networked-demo bootstrap flows.
 * For the signed invite envelope type, use `ObpSessionInvitePayload` from `@cfd/obp-auth`.
 */
export type RegistrationInviteProof = {
  session: RegistrationSessionWire;
  inviteToken: string;
};

export type NegotiationRoomCreated = {
  roomId: string;
  /** Opaque pairing root for join tickets; semantics depend on the relay adapter. */
  pairingSecretHex?: string;
};

export type NegotiationRoomTicket = {
  roomId: string;
  ticket: string;
  expiresAtMs?: number;
};

/**
 * Transport-agnostic bilateral negotiation room primitive; concrete relays implement this
 * (distinct from `@cfd/relay-server` HTTP routes).
 */
export interface NegotiationRelayPort {
  createNegotiationRoom(input?: {
    ttlMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<NegotiationRoomCreated>;

  issueJoinTicket(input: { roomId: string }): Promise<NegotiationRoomTicket>;

  verifyJoinTicket(input: { roomId: string; ticket: string }): Promise<boolean>;
}

/** Advertise availability on a topic (relay may fan out to subscribers). */
export type InviteCarrierIntent = {
  topic: string;
  issuerActorHex: string;
  text?: string;
  relayEndpoint?: string;
  issuedAt?: number;
};

/** Delivers an opaque OBP session invite (or other join token) to a targeted actor. */
export type InviteCarrierResponse = {
  intentActorHex: string;
  inviteToken: string;
};
