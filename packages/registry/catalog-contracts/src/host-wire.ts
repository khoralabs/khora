import type {
  HostHealthProbedEndpoint,
  HostHealthStatus,
  HostStatus,
  HostTrustedOriginQuotaRequest,
  HostTrustedOriginRequest,
} from "./catalog";
import type { RegistrationRequirementState, RegistrationTrustLevel } from "./registration";

/** Registry fields shared by GET/mutation registry responses (without slug/status). */
export type HostRegistryWireFragment = {
  registryParticipationEnabled: boolean;
  trustedOrigins: string[];
  pendingOriginRequests: HostTrustedOriginRequest[];
  pendingQuotaRequest: HostTrustedOriginQuotaRequest | null;
  trustedOriginQuota: { used: number; pending: number; included: number };
};

/**
 * JSON body from `GET /v1/hosts/:slug/registry` and mutation responses that
 * return registry state (origin/quota request cancel, origin remove).
 */
export type HostRegistryWireState = HostRegistryWireFragment & {
  slug: string;
  status: HostStatus | string;
};

/** Health block nested under `host` in registration responses (`hostHealthJson`). */
export type HostRegistrationHostHealthWire = {
  status: HostHealthStatus | string;
  readyPath: string;
  healthPath: string;
  checkedAtMs: number | null;
  latencyMs: number | null;
  probedEndpoint: HostHealthProbedEndpoint | null;
};

/** Compact health from `registrationStatusJson` (top-level on registration responses). */
export type HostRegistrationStatusHealthWire = {
  status: HostHealthStatus | string;
  checkedAtMs: number | null;
  latencyMs: number | null;
  probedEndpoint: HostHealthProbedEndpoint | null;
};

/**
 * Nested `host` object on registration / claim responses (`hostToFullJson`).
 */
export type HostRegistrationHostWire = {
  id: string;
  slug: string;
  baseUrl: string;
  displayName?: string;
  description?: string;
  capabilities?: Record<string, unknown>;
  optedInAtMs: number | null;
  health: HostRegistrationHostHealthWire;
  status: HostStatus | string;
  registrationRequirements: RegistrationRequirementState[];
  registryParticipationEnabled: boolean;
  includedTrustedOrigins: number;
  trustedOrigins: string[];
  trustedOriginQuota: { used: number; pending: number; included: number };
  pendingOriginRequests: HostTrustedOriginRequest[];
  pendingQuotaRequest: HostTrustedOriginQuotaRequest | null;
};

/**
 * JSON body from `POST /v1/hosts/register`,
 * `GET /v1/hosts/:slug/registration`, and
 * `POST /v1/hosts/:slug/registration/claim`.
 */
export type HostRegistrationWireState = {
  status: HostStatus | string;
  trustLevel?: RegistrationTrustLevel | string;
  requirements?: RegistrationRequirementState[];
  health?: HostRegistrationStatusHealthWire;
  activated?: boolean;
  registrationSecret?: string;
  managementToken?: string;
  message?: string;
  slug?: string;
  host?: HostRegistrationHostWire;
};

/** Shared status fields from `registrationStatusJson`. */
export type HostRegistrationStatusWire = {
  slug: string;
  status: HostStatus | string;
  trustLevel: RegistrationTrustLevel | string;
  requirements: RegistrationRequirementState[];
  health: HostRegistrationStatusHealthWire;
};
