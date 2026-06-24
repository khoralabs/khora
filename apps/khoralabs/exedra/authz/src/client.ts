import type {
  AccountsForOrgAdminRequest,
  AccountsForOrgAdminResponse,
  AccountsForTeamRequest,
  AccountsForTeamResponse,
  AuthzClient,
  AuthzClientOptions,
  BatchDecideRequest,
  BatchDecideResponse,
  DecideRequest,
  DecideResponse,
  GrantRequest,
  HasGrantRequest,
  HasGrantResponse,
  ListGrantScopesForResourceRequest,
  ListGrantScopesForResourceResponse,
  ListGrantsForScopeRequest,
  ListGrantsForScopeResponse,
  ListRelatedRequest,
  ListRelatedResponse,
  OrgForTeamRequest,
  OrgForTeamResponse,
  RelationshipRequest,
  RevokeGrantsForScopeFeatureRequest,
  RevokeGrantsReferencingResourceRequest,
  ScopeHasAnyGrantRequest,
  ScopeHasAnyGrantResponse,
  TeamsForAccountRequest,
  TeamsForAccountResponse,
  TeamsForOrgRequest,
  TeamsForOrgResponse,
} from "./types";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = `Authz request failed ${res.status}`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      if (text.length > 0) message = text;
    }
    throw new Error(message);
  }
  return (text.length > 0 ? JSON.parse(text) : {}) as T;
}

export function createAuthzClient(options: AuthzClientOptions): AuthzClient {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchFn = options.fetchFn ?? fetch;
  const headers = {
    Authorization: `Bearer ${options.token}`,
    "Content-Type": "application/json",
  };

  async function post<T>(path: string, body: unknown): Promise<T> {
    return readJson<T>(
      await fetchFn(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
  }

  async function del<T>(path: string, body: unknown): Promise<T> {
    return readJson<T>(
      await fetchFn(`${baseUrl}${path}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify(body),
      }),
    );
  }

  return {
    decide: (request: DecideRequest) => post<DecideResponse>("/decide", request),
    decideBatch: (request: BatchDecideRequest) =>
      post<BatchDecideResponse>("/decide/batch", request),
    grant: (request: GrantRequest) => post<{ id: string }>("/grants", request),
    revokeGrant: (request) => del<{ ok: true }>("/grants", request),
    revokeGrantsForScopeFeature: (request: RevokeGrantsForScopeFeatureRequest) =>
      post<{ ok: true }>("/grants/revoke-for-scope-feature", request),
    revokeGrantsReferencingResource: (request: RevokeGrantsReferencingResourceRequest) =>
      post<{ ok: true }>("/grants/revoke-referencing-resource", request),
    relate: (request: RelationshipRequest) => post<{ id: string }>("/relationships", request),
    revokeRelationship: (request) => del<{ ok: true }>("/relationships", request),
    listGrantsForScope: (request: ListGrantsForScopeRequest) =>
      post<ListGrantsForScopeResponse>("/query/grants/for-scope", request),
    listGrantScopesForResource: (request: ListGrantScopesForResourceRequest) =>
      post<ListGrantScopesForResourceResponse>("/query/grants/scopes-for-resource", request),
    hasGrant: (request: HasGrantRequest) => post<HasGrantResponse>("/query/grants/has", request),
    scopeHasAnyGrant: (request: ScopeHasAnyGrantRequest) =>
      post<ScopeHasAnyGrantResponse>("/query/grants/scope-has-any", request),
    listRelatedFrom: (request: ListRelatedRequest) =>
      post<ListRelatedResponse>("/query/relationships/related-from", request),
    listRelatedTo: (request: ListRelatedRequest) =>
      post<ListRelatedResponse>("/query/relationships/related-to", request),
    getOrgIdForTeam: (request: OrgForTeamRequest) =>
      post<OrgForTeamResponse>("/query/org-for-team", request),
    listTeamIdsForOrg: (request: TeamsForOrgRequest) =>
      post<TeamsForOrgResponse>("/query/teams-for-org", request),
    listAccountIdsForTeam: (request: AccountsForTeamRequest) =>
      post<AccountsForTeamResponse>("/query/accounts-for-team", request),
    listAccountIdsForOrgAdmin: (request: AccountsForOrgAdminRequest) =>
      post<AccountsForOrgAdminResponse>("/query/accounts-for-org-admin", request),
    listTeamIdsForAccount: (request: TeamsForAccountRequest) =>
      post<TeamsForAccountResponse>("/query/teams-for-account", request),
    ensureSchema: () => post<{ ok: true }>("/schema/ensure", {}),
  };
}
