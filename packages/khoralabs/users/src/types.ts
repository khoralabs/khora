export type AccountStatus = "active" | "suspended";
export type HostStatus = "active" | "suspended";
export type MembershipStatus = "requested" | "invited" | "active" | "revoked";
export type AccessTokenRequestStatus = "pending" | "minted" | "sent" | "redeemed";

export type Account = {
  id: string;
  status: AccountStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type AtriumHost = {
  id: string;
  slug: string;
  baseUrl: string;
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
