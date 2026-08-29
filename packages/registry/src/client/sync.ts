import { type RegistryClientConfig, readServerPublicOrigin } from "./config";
import { fetchHostRegistryState, requestHostTrustedOriginRemote } from "./registry-state";

export async function syncHostRegistryOnStartup(
  config: RegistryClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (config.trustBaseUrlOrigin !== true) {
    return;
  }
  const state = await fetchHostRegistryState(config, fetchImpl);
  const serverOrigin = readServerPublicOrigin(config);
  const approved = state.origins.includes(serverOrigin);
  const pending = state.pendingOriginRequests.some(
    (request) => request.origin === serverOrigin && request.status === "pending",
  );
  if (approved || pending) {
    return;
  }
  await requestHostTrustedOriginRemote(config, serverOrigin, fetchImpl);
}
