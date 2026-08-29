export { clientIpFromRequest, runWithRequestPeerIp } from "./client-ip";
export type { RegistryHostContext } from "./context";
export { handleOptions, withCors } from "./cors";
export { createRegistryHost } from "./create-registry-host";
export { dispatchRegistryHostFetch } from "./fetch";
export { probeHostHealth, probeHostHealthById, runHostHealthPoll } from "./host-health";
export {
  type AgentAuthRouteDeps,
  handleAgentAuthClaimComplete,
  handleAgentAuthRegister,
  handleOAuthAuthorizationServerMetadata,
  handleOAuthProtectedResourceMetadata,
} from "./identity-routes/agent-auth";
export {
  createRegistryIdentityRoutes,
  type RegistryIdentityRoutesDeps,
} from "./identity-routes/create-registry-identity-routes";
export {
  type DeviceRouteDeps,
  handleDeviceApprove,
  handleDeviceAuthorize,
  handleDeviceToken,
} from "./identity-routes/device";
export type {
  RegistryAuthHttpPort,
  RegistryIdentityPort,
  RegistryIdentityRoutes,
  RegistrySession,
} from "./ports/identity";
export type { RegistryHostDeps } from "./registry-host-deps";
export { initRegistryHostRuntime, type RegistryHostRuntime, registryHostRuntime } from "./runtime";
export { readRegistryTrustedOrigins } from "./trusted-origins";
