import type { RegistrationRequirementState } from "./registration";

export type HostStatus = "pending" | "active" | "suspended";
export type HostHealthStatus = "unknown" | "up" | "down";
export type HostHealthProbedEndpoint = "ready" | "health";

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

export type HostRegistryState = {
  participationEnabled: boolean;
  origins: string[];
  pendingOriginRequests: HostTrustedOriginRequest[];
  pendingQuotaRequest: HostTrustedOriginQuotaRequest | null;
  quota: { used: number; pending: number; included: number };
};

export type RegistryHostSummaryItem = KhoraHost & {
  trustedOrigins: string[];
  trustedOriginQuota: { used: number; pending: number; included: number };
  pendingOriginRequestCount: number;
  pendingQuotaRequestCount: number;
};

export type RegistryHostsSummary = {
  total: number;
  active: number;
  pendingOriginRequests: number;
  pendingQuotaRequests: number;
  items: RegistryHostSummaryItem[];
};

export type RegistryAdminSummary = {
  accounts: { total: number; active: number; suspended: number };
  hosts: RegistryHostsSummary;
  marketingConsents: {
    total: number;
    active: number;
    optedOut: number;
    byListSlug: Record<string, number>;
  };
  memberships: { total: number };
};
