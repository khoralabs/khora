export type ScopeRef = {
  type: string;
  id: string;
};

export type ResourceRef = {
  type: string;
  id: string;
};

export type GrantRecord = {
  id: string;
  scopeType: string;
  scopeId: string;
  resourceType: string;
  resourceId: string;
  feature: string;
  createdAtMs: number;
  expiredAtMs: number | null;
  revokedAtMs: number | null;
};

export type EntitlementRecord = {
  id: string;
  scopeType: string;
  scopeId: string;
  feature: string;
  createdAtMs: number;
  expiredAtMs: number | null;
  revokedAtMs: number | null;
};
