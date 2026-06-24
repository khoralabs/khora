export type EntityRef = {
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

export type RelationshipRecord = {
  id: string;
  fromType: string;
  fromId: string;
  relation: string;
  toType: string;
  toId: string;
  createdAtMs: number;
  expiredAtMs: number | null;
  revokedAtMs: number | null;
};

export type GrantRequest = {
  scope: EntityRef;
  resource: EntityRef;
  feature: string;
  expiresAtMs?: number | null;
};

export type RelationshipRequest = {
  from: EntityRef;
  relation: string;
  to: EntityRef;
  expiresAtMs?: number | null;
};

export type DecideRequest = {
  subject: EntityRef;
  action: string;
  resource: EntityRef & Record<string, unknown>;
};

export type DecideResponse = {
  allowed: boolean;
  reason?: string;
};

export type BatchDecideRequest = {
  requests: DecideRequest[];
};

export type BatchDecideResponse = {
  results: DecideResponse[];
};

export type ListGrantsForScopeRequest = {
  scope: EntityRef;
};

export type ListGrantsForScopeResponse = {
  grants: GrantRecord[];
};

export type ListGrantScopesForResourceRequest = {
  resource: EntityRef;
  feature: string;
  scopeType: string;
};

export type ListGrantScopesForResourceResponse = {
  scopeIds: string[];
};

export type HasGrantRequest = {
  scope: EntityRef;
  resource: EntityRef;
  feature: string;
};

export type HasGrantResponse = {
  hasGrant: boolean;
};

export type ScopeHasAnyGrantRequest = {
  scope: EntityRef;
  resourceType: string;
  feature: string;
};

export type ScopeHasAnyGrantResponse = {
  hasGrant: boolean;
};

export type ListRelatedRequest = {
  entity: EntityRef;
  relation: string;
  filterType?: string;
};

export type ListRelatedResponse = {
  entities: EntityRef[];
};

export type RevokeGrantsForScopeFeatureRequest = {
  scope: EntityRef;
  feature: string;
  resourceType?: string;
};

export type RevokeGrantsReferencingResourceRequest = {
  resource: EntityRef;
};

export type OrgForTeamRequest = {
  teamId: string;
};

export type OrgForTeamResponse = {
  orgId: string | null;
};

export type TeamsForOrgRequest = {
  orgId: string;
};

export type TeamsForOrgResponse = {
  teamIds: string[];
};

export type AccountsForTeamRequest = {
  teamId: string;
  feature?: string;
};

export type AccountsForTeamResponse = {
  accountIds: string[];
};

export type AccountsForOrgAdminRequest = {
  orgId: string;
};

export type AccountsForOrgAdminResponse = {
  accountIds: string[];
};

export type TeamsForAccountRequest = {
  accountId: string;
};

export type TeamsForAccountResponse = {
  teamIds: string[];
};

export type AuthzClientOptions = {
  baseUrl: string;
  token: string;
  fetchFn?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

export type AuthzClient = {
  decide(request: DecideRequest): Promise<DecideResponse>;
  decideBatch(request: BatchDecideRequest): Promise<BatchDecideResponse>;
  grant(request: GrantRequest): Promise<{ id: string }>;
  revokeGrant(request: Omit<GrantRequest, "expiresAtMs">): Promise<{ ok: true }>;
  revokeGrantsForScopeFeature(request: RevokeGrantsForScopeFeatureRequest): Promise<{ ok: true }>;
  revokeGrantsReferencingResource(
    request: RevokeGrantsReferencingResourceRequest,
  ): Promise<{ ok: true }>;
  relate(request: RelationshipRequest): Promise<{ id: string }>;
  revokeRelationship(request: Omit<RelationshipRequest, "expiresAtMs">): Promise<{ ok: true }>;
  listGrantsForScope(request: ListGrantsForScopeRequest): Promise<ListGrantsForScopeResponse>;
  listGrantScopesForResource(
    request: ListGrantScopesForResourceRequest,
  ): Promise<ListGrantScopesForResourceResponse>;
  hasGrant(request: HasGrantRequest): Promise<HasGrantResponse>;
  scopeHasAnyGrant(request: ScopeHasAnyGrantRequest): Promise<ScopeHasAnyGrantResponse>;
  listRelatedFrom(request: ListRelatedRequest): Promise<ListRelatedResponse>;
  listRelatedTo(request: ListRelatedRequest): Promise<ListRelatedResponse>;
  getOrgIdForTeam(request: OrgForTeamRequest): Promise<OrgForTeamResponse>;
  listTeamIdsForOrg(request: TeamsForOrgRequest): Promise<TeamsForOrgResponse>;
  listAccountIdsForTeam(request: AccountsForTeamRequest): Promise<AccountsForTeamResponse>;
  listAccountIdsForOrgAdmin(
    request: AccountsForOrgAdminRequest,
  ): Promise<AccountsForOrgAdminResponse>;
  listTeamIdsForAccount(request: TeamsForAccountRequest): Promise<TeamsForAccountResponse>;
  ensureSchema(): Promise<{ ok: true }>;
};
