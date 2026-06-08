import type { RegistryHostContext } from "./context";
import { dispatchRegistryHostFetch } from "./fetch";
import { startHostHealthPoller } from "./host-health";
import type { RegistryHostDeps } from "./registry-host-deps";
import { initRegistryHostRuntime, type RegistryHostRuntime } from "./runtime";

export function createRegistryHost(deps: RegistryHostDeps): RegistryHostContext {
  const runtime: RegistryHostRuntime = {
    db: deps.db,
    identity: deps.identity,
    consoleAuth: deps.consoleAuth,
    publicUrl: deps.publicUrl,
    trustedOrigins: deps.resolveTrustedOrigins,
  };
  initRegistryHostRuntime(runtime);
  startHostHealthPoller(deps.db);

  return {
    db: deps.db,
    identity: deps.identity,
    fetch: (req) => dispatchRegistryHostFetch(runtime, req),
    stop() {
      /* health poller uses setInterval; no handle stored today */
    },
  };
}
