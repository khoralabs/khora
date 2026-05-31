import type { RegistrationRequirementState } from "./host-registration-requirements";
import type { SnakeCaseKey, SqlRow } from "./sql-row";
import { sqlSelectColumns } from "./sql-row";

export type AccountStatus = "active" | "suspended";
export type HostStatus = "pending" | "active" | "suspended";
export type HostHealthStatus = "unknown" | "up" | "down";
export type HostHealthProbedEndpoint = "ready" | "health";

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
  registryParticipationEnabled: boolean;
  includedTrustedOrigins: number;
  registrationRequirements: RegistrationRequirementState[];
};

export type HostTrustedOrigin = {
  id: string;
  hostId: string;
  origin: string;
  createdAtMs: number;
};

export type HostTrustedOriginRequestStatus = "pending" | "approved" | "rejected";

export type HostTrustedOriginRequest = {
  id: string;
  hostId: string;
  origin: string;
  status: HostTrustedOriginRequestStatus;
  requestedAtMs: number;
  reviewedAtMs: number | null;
};

export type HostTrustedOriginQuotaRequestStatus = "pending" | "approved" | "rejected";

export type HostTrustedOriginQuotaRequest = {
  id: string;
  hostId: string;
  requestedIncluded: number;
  status: HostTrustedOriginQuotaRequestStatus;
  requestedAtMs: number;
  reviewedAtMs: number | null;
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
  createdAtMs: number;
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
/** Columns loaded from SQLite for khora_hosts (JSON-backed fields are row overrides). */
type KhoraHostSqlFields = Omit<KhoraHost, "registrationRequirements">;

export type KhoraHostRow = SqlRow<KhoraHostSqlFields> & {
  registration_requirements: string | null;
  management_token_hash: string | null;
  registration_secret_hash: string | null;
  pending_management_token: string | null;
};
export type HostTrustedOriginRow = SqlRow<HostTrustedOrigin>;
export type HostTrustedOriginRequestRow = SqlRow<HostTrustedOriginRequest>;
export type HostTrustedOriginQuotaRequestRow = SqlRow<HostTrustedOriginQuotaRequest>;
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
  registryParticipationEnabled: "registry_participation_enabled",
  includedTrustedOrigins: "included_trusted_origins",
} as const satisfies { [K in keyof KhoraHostSqlFields]: SnakeCaseKey<K & string> };

export const HOST_TRUSTED_ORIGIN_SQL_COLUMNS = {
  id: "id",
  hostId: "host_id",
  origin: "origin",
  createdAtMs: "created_at_ms",
} as const satisfies { [K in keyof HostTrustedOrigin]: SnakeCaseKey<K & string> };

export const HOST_TRUSTED_ORIGIN_SELECT = sqlSelectColumns(HOST_TRUSTED_ORIGIN_SQL_COLUMNS);

export const HOST_TRUSTED_ORIGIN_REQUEST_SQL_COLUMNS = {
  id: "id",
  hostId: "host_id",
  origin: "origin",
  status: "status",
  requestedAtMs: "requested_at_ms",
  reviewedAtMs: "reviewed_at_ms",
} as const satisfies {
  [K in keyof HostTrustedOriginRequest]: SnakeCaseKey<K & string>;
};

export const HOST_TRUSTED_ORIGIN_REQUEST_SELECT = sqlSelectColumns(
  HOST_TRUSTED_ORIGIN_REQUEST_SQL_COLUMNS,
);

export const HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SQL_COLUMNS = {
  id: "id",
  hostId: "host_id",
  requestedIncluded: "requested_included",
  status: "status",
  requestedAtMs: "requested_at_ms",
  reviewedAtMs: "reviewed_at_ms",
} as const satisfies {
  [K in keyof HostTrustedOriginQuotaRequest]: SnakeCaseKey<K & string>;
};

export const HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SELECT = sqlSelectColumns(
  HOST_TRUSTED_ORIGIN_QUOTA_REQUEST_SQL_COLUMNS,
);

export const KHORA_HOST_SELECT = `${sqlSelectColumns(KHORA_HOST_SQL_COLUMNS)}, registration_requirements`;
