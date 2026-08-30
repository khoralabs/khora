import type { RegistryDatabase } from "@khoralabs/khora-registry/persistence";
import type { RegistryAuthHttpPort, RegistryIdentityPort } from "../ports/identity";
import {
  handleAgentAuthClaimComplete,
  handleAgentAuthRegister,
  handleOAuthAuthorizationServerMetadata,
  handleOAuthProtectedResourceMetadata,
} from "./agent-auth";
import { handleDeviceApprove, handleDeviceAuthorize, handleDeviceToken } from "./device";

export type RegistryIdentityRoutesDeps = {
  db: RegistryDatabase;
  identity: RegistryIdentityPort;
  authHttp: RegistryAuthHttpPort;
  publicUrl: () => string;
  authMdUrl?: string;
  resourceName?: string;
  deviceVerificationPath?: string;
  defaultSourceApp?: string;
};

export function createRegistryIdentityRoutes(deps: RegistryIdentityRoutesDeps) {
  const authMdUrl = deps.authMdUrl ?? "https://khoralabs.com/auth.md";
  const resourceName = deps.resourceName ?? "Khora Registry";
  const deviceVerificationPath = deps.deviceVerificationPath ?? "/cli/link";
  const defaultSourceApp = deps.defaultSourceApp ?? "khora-cli";

  const deviceDeps = {
    db: deps.db,
    identity: deps.identity,
    authHttp: deps.authHttp,
    publicUrl: deps.publicUrl,
    deviceVerificationPath,
    defaultSourceApp,
  };

  const agentDeps = {
    db: deps.db,
    authHttp: deps.authHttp,
    publicUrl: deps.publicUrl,
    authMdUrl,
    resourceName,
  };

  return {
    async handle(req: Request, path: string): Promise<Response | null> {
      if (path.startsWith("/api/auth")) {
        return deps.authHttp.handleAuthApi(req);
      }

      if (path === "/v1/device/authorize" && req.method === "POST") {
        return handleDeviceAuthorize(req, deviceDeps);
      }
      if (path === "/v1/device/approve" && req.method === "POST") {
        return handleDeviceApprove(req, deviceDeps);
      }
      if (path === "/v1/device/token" && req.method === "POST") {
        return handleDeviceToken(req, deviceDeps);
      }

      if (path === "/.well-known/oauth-protected-resource" && req.method === "GET") {
        return handleOAuthProtectedResourceMetadata(agentDeps);
      }
      if (path === "/.well-known/oauth-authorization-server" && req.method === "GET") {
        return handleOAuthAuthorizationServerMetadata(agentDeps);
      }
      if (path === "/agent/auth" && req.method === "POST") {
        return handleAgentAuthRegister(req, agentDeps);
      }
      if (path === "/agent/auth/claim/complete" && req.method === "POST") {
        return handleAgentAuthClaimComplete(req, agentDeps);
      }

      return null;
    },
  };
}
