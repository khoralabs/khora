/**
 * Agent→registry client: cookie session, device/agent auth, link ceremony, public host catalog.
 * Distinct from `@khoralabs/khora-registry/client` (host→registry management).
 */

export {
  type AgentAuthPending,
  clearAgentAuthPending,
  readAgentAuthPending,
  writeAgentAuthPending,
} from "./agent-auth-pending";
export { defaultRegistryUrl } from "./default-registry-url";
export {
  agentAuthComplete,
  agentAuthRegister,
  deviceAuthorize,
  devicePollToken,
  fetchHosts,
  type LinkAgentResult,
  linkAgent,
  linkChallenge,
  linkEnsure,
  linkStatus,
  linkUnlink,
  type RegistryHostHealth,
  type RegistryHostPublic,
  registerHost,
  registryFetch,
} from "./http";
export {
  clearLinkState,
  type LinkState,
  type LinkStateEntry,
  linkStatePath,
  readLinkState,
  writeLinkState,
} from "./link-state";
export {
  clearRegistrySessionCookie,
  loadRegistrySessionCookie,
  registrySessionFilePath,
  saveRegistrySessionCookie,
} from "./session-store";
