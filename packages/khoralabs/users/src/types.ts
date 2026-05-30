import type { SnakeCaseKey, SqlRow } from "./sql-row";
import { sqlSelectColumns } from "./sql-row";

export type AccountStatus = "active" | "suspended";
export type HostStatus = "pending" | "active" | "suspended";
export type HostHealthStatus = "unknown" | "up" | "down";
export type HostHealthProbedEndpoint = "ready" | "health";
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
  healthReadyPath: string;
  healthPath: string;
  healthStatus: HostHealthStatus;
  healthCheckedAtMs: number | null;
  healthLatencyMs: number | null;
  healthProbedEndpoint: HostHealthProbedEndpoint | null;
  corsTrusted: boolean;
  clientOrigin: string | null;
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
  status: MembershipStatus;
  createdAtMs: number;
  updatedAtMs: number;
};

export type AccountAgentLink = {
  id: string;
  membershipId: string;
  accountId: string;
  hostId: string;
  agentDid: string;
  linkedAtMs: number;
};

export type AgentAccountBinding = {
  agentDid: string;
  accountId: string;
  boundAtMs: number;
  boundViaHostId: string | null;
};

export type HostLinkPropagationResult = {
  hostId: string;
  ok: boolean;
  error?: string;
  linkId?: string;
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

/** SQLite row shapes (snake_case columns) derived from domain types above */
export type AccountRow = SqlRow<Account>;
export type KhoraHostRow = SqlRow<KhoraHost>;
export type AccessTokenRequestRow = SqlRow<AccessTokenRequest>;
export type MarketingConsentRow = SqlRow<MarketingConsent>;
export type MembershipRow = SqlRow<Membership>;
export type AccountAgentLinkRow = SqlRow<AccountAgentLink>;
export type AgentAccountBindingRow = SqlRow<AgentAccountBinding>;
export type DeviceAuthorizationRow = SqlRow<DeviceAuthorization>;
export type CliLinkChallengeRow = SqlRow<CliLinkChallenge>;

/** Domain key → SQL column; satisfies SnakeCaseKey for compile-time checks */
export const KHORA_HOST_SQL_COLUMNS = {
  id: "id",
  slug: "slug",
  baseUrl: "base_url",
  displayName: "display_name",
  description: "description",
  status: "status",
  optedInAtMs: "opted_in_at_ms",
  capabilities: "capabilities",
  healthReadyPath: "health_ready_path",
  healthPath: "health_path",
  healthStatus: "health_status",
  healthCheckedAtMs: "health_checked_at_ms",
  healthLatencyMs: "health_latency_ms",
  healthProbedEndpoint: "health_probed_endpoint",
  corsTrusted: "cors_trusted",
  clientOrigin: "client_origin",
} as const satisfies { [K in keyof KhoraHost]: SnakeCaseKey<K & string> };

export const KHORA_HOST_SELECT = sqlSelectColumns(KHORA_HOST_SQL_COLUMNS);
