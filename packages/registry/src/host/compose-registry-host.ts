import type { AdminTokenAuth } from "@khoralabs/khora-auth";
import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";
import type { RegistryHostContext } from "./context";
import { createRegistryHost } from "./create-registry-host";
import {
  createRegistryIdentityRoutes,
  type RegistryIdentityRoutesDeps,
} from "./identity-routes/create-registry-identity-routes";
import type {
  RegistryAuthHttpPort,
  RegistryIdentityPort,
  RegistryIdentityRoutes,
} from "./ports/identity";
import { resolveRegistryPublicUrl } from "./resolve-registry-public-url";
import { readRegistryTrustedOrigins } from "./trusted-origins";

export type ComposeRegistryHostDeps = {
  db: RegistryDatabase;
  identity: RegistryIdentityPort;
  authHttp: RegistryAuthHttpPort;
  adminTokenAuth: AdminTokenAuth | null;
  /** Defaults to {@link resolveRegistryPublicUrl}. */
  publicUrl?: () => string;
  resolveTrustedOrigins?: () => string[] | Promise<string[]>;
  /** Overrides for identity route metadata (auth.md, CLI link path, …). */
  identityRouteOptions?: Omit<
    RegistryIdentityRoutesDeps,
    "db" | "identity" | "authHttp" | "publicUrl"
  >;
};

/**
 * Given an open domain DB and IdP ports, wire identity routes + federation host.
 * Callers still open the DB, run auth schema, and construct identity/authHttp ports.
 */
export function composeRegistryHost(deps: ComposeRegistryHostDeps): {
  host: RegistryHostContext;
  identityRoutes: RegistryIdentityRoutes;
} {
  const resolveTrustedOrigins =
    deps.resolveTrustedOrigins ?? (() => readRegistryTrustedOrigins(deps.db));
  const publicUrl = deps.publicUrl ?? (() => resolveRegistryPublicUrl());

  const identityRoutes = createRegistryIdentityRoutes({
    db: deps.db,
    identity: deps.identity,
    authHttp: deps.authHttp,
    publicUrl,
    ...deps.identityRouteOptions,
  });

  const host = createRegistryHost({
    db: deps.db,
    identity: deps.identity,
    adminTokenAuth: deps.adminTokenAuth,
    publicUrl,
    resolveTrustedOrigins,
  });

  return { host, identityRoutes };
}
