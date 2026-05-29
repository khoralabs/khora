export type AccountStatus = "active" | "suspended";
export type HostStatus = "pending" | "active" | "suspended";
export type MembershipStatus = "requested" | "invited" | "active" | "revoked";
export type AccessTokenRequestStatus = "pending" | "minted" | "sent" | "redeemed";

export type Account = {
  id: string;
  status: AccountStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type KhoraHost = {
  id: string;
  slug: string;
  baseUrl: string;
  displayName: string | null;
  description: string | null;
  status: HostStatus;
  optedInAtMs: number | null;
  capabilities: Record<string, unknown> | null;
};

export type AccessTokenRequest = {
  id: string;
  email: string;
  hostId: string;
  accountId: string | null;
  membershipId: string | null;
  status: AccessTokenRequestStatus;
  inviteTokenHash: string | null;
  requestedAtMs: number;
  mintedAtMs: number | null;
  sentAtMs: number | null;
  redeemedAtMs: number | null;
  sourceApp: string | null;
};

export type MarketingConsent = {
  id: string;
  email: string;
  accountId: string | null;
  listSlug: string;
  optedInAtMs: number;
  optedOutAtMs: number | null;
  sourceApp: string | null;
};

export type Membership = {
  id: string;
  accountId: string;
  hostId: string;
  inviteTokenHash: string | null;
  agentDid: string | null;
  status: MembershipStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type DeviceAuthorizationStatus = "pending" | "approved" | "consumed" | "expired";

export type DeviceAuthorization = {
  id: string;
  deviceCodeHash: string;
  userCode: string;
  status: DeviceAuthorizationStatus;
  sessionToken: string | null;
  expiresAtMs: number;
  approvedAtMs: number | null;
  consumedAtMs: number | null;
  sourceApp: string | null;
  createdAtMs: number;
};

export type CliLinkChallenge = {
  id: string;
  agentDid: string;
  nonce: string;
  expiresAtMs: number;
  consumedAtMs: number | null;
  createdAtMs: number;
};
