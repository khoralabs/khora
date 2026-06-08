import type { Database } from "bun:sqlite";
import type { RegistryIdentityPort } from "@khoralabs/registry-host";
import { getRegistryAuth } from "./auth";
import {
  handleAgentAuthClaimComplete,
  handleAgentAuthRegister,
  handleOAuthAuthorizationServerMetadata,
  handleOAuthProtectedResourceMetadata,
} from "./routes/agent-auth";
import { handleDeviceApprove, handleDeviceAuthorize, handleDeviceToken } from "./routes/device";

export type BetterAuthRegistryRoutesDeps = {
  db: Database;
  identity: RegistryIdentityPort;
  publicUrl: () => string;
  authMdUrl?: string;
  resourceName?: string;
  deviceVerificationPath?: string;
  defaultSourceApp?: string;
};

export function createBetterAuthRegistryRoutes(deps: BetterAuthRegistryRoutesDeps) {
  const routeDeps = {
    db: deps.db,
    identity: deps.identity,
    publicUrl: deps.publicUrl,
    authMdUrl: deps.authMdUrl ?? "https://khoralabs.com/auth.md",
    resourceName: deps.resourceName ?? "Khora Registry",
    deviceVerificationPath: deps.deviceVerificationPath ?? "/cli/link",
    defaultSourceApp: deps.defaultSourceApp ?? "khora-cli",
    callAuthEndpoint: async (path: string, body: unknown) => {
      const base = deps.publicUrl();
      return getRegistryAuth().handler(
        new Request(`${base}/api/auth${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    },
  };

  return {
    async handle(req: Request, path: string): Promise<Response | null> {
      if (path.startsWith("/api/auth")) {
        return getRegistryAuth().handler(req);
      }

      if (path === "/v1/device/authorize" && req.method === "POST") {
        return handleDeviceAuthorize(req, routeDeps);
      }
      if (path === "/v1/device/approve" && req.method === "POST") {
        return handleDeviceApprove(req, routeDeps);
      }
      if (path === "/v1/device/token" && req.method === "POST") {
        return handleDeviceToken(req, routeDeps);
      }

      if (path === "/.well-known/oauth-protected-resource" && req.method === "GET") {
        return handleOAuthProtectedResourceMetadata(routeDeps);
      }
      if (path === "/.well-known/oauth-authorization-server" && req.method === "GET") {
        return handleOAuthAuthorizationServerMetadata(routeDeps);
      }
      if (path === "/agent/auth" && req.method === "POST") {
        return handleAgentAuthRegister(req, routeDeps);
      }
      if (path === "/agent/auth/claim/complete" && req.method === "POST") {
        return handleAgentAuthClaimComplete(req, routeDeps);
      }

      return null;
    },
  };
}
