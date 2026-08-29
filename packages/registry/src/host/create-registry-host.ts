import type { RegistryHostContext } from "./context";
import { dispatchRegistryHostFetch } from "./fetch";
import { startHostHealthPoller } from "./host-health";
import type { RegistryHostDeps } from "./registry-host-deps";
import { initRegistryHostRuntime, type RegistryHostRuntime } from "./runtime";

export function createRegistryHost(deps: RegistryHostDeps): RegistryHostContext {
  let trustedOriginsCache: string[] = [];

  const refreshTrustedOrigins = (): Promise<void> =>
    Promise.resolve(deps.resolveTrustedOrigins()).then((origins) => {
      trustedOriginsCache = origins;
    });

  void refreshTrustedOrigins();

  const identity = {
    ...deps.identity,
    reloadTrustedOrigins() {
      deps.identity.reloadTrustedOrigins?.();
      void refreshTrustedOrigins();
    },
  };

  const runtime: RegistryHostRuntime = {
    db: deps.db,
    identity,
    adminTokenAuth: deps.adminTokenAuth,
    publicUrl: deps.publicUrl,
    trustedOrigins: () => trustedOriginsCache,
  };
  initRegistryHostRuntime(runtime);
  startHostHealthPoller(deps.db);

  return {
    db: deps.db,
    identity,
    fetch: (req) => dispatchRegistryHostFetch(runtime, req),
    stop() {
      /* health poller uses setInterval; no handle stored today */
    },
  };
}
