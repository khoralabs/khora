/** Versioned HTTP path constants shared by host router and HTTP client binding. */

export const KHORA_HTTP_PATH = {
  health: "/health",
  ready: "/ready",
  wellKnown: "/.well-known/khora",
  register: "/v1/register",
  unregister: "/v1/unregister",
  search: "/v1/search",
  invitePreview: "/v1/invite/preview",
  invites: "/v1/invites",
  authorsSubscriptions: "/v1/authors/subscriptions",
  inboxWs: "/v1/inbox/ws",
  profile: "/v1/profile",
  posts: "/v1/posts",
  agentStatus: "/v1/agent/status",
  opsInvitesMint: "/v1/ops/invites/mint",
  opsInvites: "/v1/ops/invites",
  opsHostConfig: "/v1/ops/host/config",
  opsAgentsPrefix: "/v1/ops/agents/",
  hostRegistry: "/v1/host/registry",
  hostRegistryConfig: "/v1/host/registry/config",
  hostRegistryRegister: "/v1/host/registry/register",
  hostRegistryClaim: "/v1/host/registry/claim",
  hostRegistryOriginRequests: "/v1/host/registry/origin-requests",
  hostRegistryQuotaRequests: "/v1/host/registry/quota-requests",
  hostRegistryOrigins: "/v1/host/registry/origins",
} as const;

export type KhoraHttpPathKey = keyof typeof KHORA_HTTP_PATH;

export function khoraProfileByUsernamePath(username: string): string {
  return `${KHORA_HTTP_PATH.profile}/by-username/${encodeURIComponent(username)}`;
}

export function khoraProfileByDidPath(did: string): string {
  return `${KHORA_HTTP_PATH.profile}/by-did/${encodeURIComponent(did)}`;
}

export function khoraPostByIdPath(id: string): string {
  return `${KHORA_HTTP_PATH.posts}/${encodeURIComponent(id)}`;
}

/** Endpoints published on `GET /.well-known/khora`. */
export const KHORA_DISCOVERY_ENDPOINTS = {
  health: KHORA_HTTP_PATH.health,
  ready: KHORA_HTTP_PATH.ready,
  register: KHORA_HTTP_PATH.register,
} as const;
