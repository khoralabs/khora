import type {
  HostTrustedOriginQuotaRequest,
  HostTrustedOriginRequest,
  RegistrationRequirementState,
} from "@khoralabs/khora-registry/contracts";

/** Client view of registry state, enriched with local origin policy flags. */
export type HostRegistryClientState = {
  slug: string;
  status: string;
  participationEnabled: boolean;
  origins: string[];
  pendingOriginRequests: HostTrustedOriginRequest[];
  pendingQuotaRequest: HostTrustedOriginQuotaRequest | null;
  quota: { used: number; pending: number; included: number };
  serverOrigin: string;
  trustBaseUrlOriginConfigured: boolean;
};

/** Client view of registration / claim responses, flattened for host UI. */
export type HostRegistrationClientState = {
  status: string;
  trustLevel?: string;
  requirements?: RegistrationRequirementState[];
  activated?: boolean;
  registrationSecret?: string;
  managementToken?: string;
  message?: string;
  slug?: string;
  participationEnabled?: boolean;
  origins?: string[];
  quota?: { used: number; included: number };
  serverOrigin?: string;
  trustBaseUrlOriginConfigured?: boolean;
};
