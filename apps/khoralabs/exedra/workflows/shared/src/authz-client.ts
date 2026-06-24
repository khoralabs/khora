import { type AuthzClient as CoreAuthzClient, createAuthzClient } from "@khoralabs/exedra-authz";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

export function createWorkflowAuthzClient(): CoreAuthzClient {
  return createAuthzClient({
    baseUrl: requireEnv("AUTHZ_SERVICE_URL"),
    token: process.env.AUTHZ_INTERNAL_TOKEN?.trim() || requireEnv("EXEDRA_INTERNAL_TOKEN"),
  });
}

export type { CoreAuthzClient };
