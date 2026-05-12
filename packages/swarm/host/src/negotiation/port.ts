/**
 * Structural match for `@khoralabs/obp-core` `SessionInitWire` (registration / bearer invites).
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
 * For the signed invite envelope type, use `ObpSessionInvitePayload` from `@khoralabs/obp-auth`.
 */
export type RegistrationInviteProof = {
  session: RegistrationSessionWire;
  inviteToken: string;
};

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
