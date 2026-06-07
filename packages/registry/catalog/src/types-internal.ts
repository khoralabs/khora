import type {
  HostTrustedOrigin,
  HostTrustedOriginQuotaRequest,
  HostTrustedOriginRequest,
  KhoraHost,
} from "@khoralabs/registry-catalog-contracts";
import type { SnakeCaseKey, SqlRow } from "./sql-row";
import { sqlSelectColumns } from "./sql-row";

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
