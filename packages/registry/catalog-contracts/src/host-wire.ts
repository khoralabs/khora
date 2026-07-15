import type {
  HostStatus,
  HostTrustedOriginQuotaRequest,
  HostTrustedOriginRequest,
} from "./catalog";
import type { RegistrationRequirementState, RegistrationTrustLevel } from "./registration";

/**
 * JSON body from `GET /v1/hosts/:slug/registry` and mutation responses that
 * return registry state (origin/quota request cancel, origin remove).
 */
export type HostRegistryWireState = {
  slug: string;
  status: HostStatus | string;
  registryParticipationEnabled: boolean;
  trustedOrigins: string[];
  pendingOriginRequests: HostTrustedOriginRequest[];
  pendingQuotaRequest: HostTrustedOriginQuotaRequest | null;
  trustedOriginQuota: { used: number; pending: number; included: number };
};

/**
 * Nested `host` object on registration / claim responses (`hostToFullJson`).
 */
export type HostRegistrationHostWire = {
  registryParticipationEnabled?: boolean;
  trustedOrigins?: string[];
  trustedOriginQuota?: { used: number; pending?: number; included: number };
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
  activated?: boolean;
  registrationSecret?: string;
  managementToken?: string;
  message?: string;
  slug?: string;
  host?: HostRegistrationHostWire;
};
