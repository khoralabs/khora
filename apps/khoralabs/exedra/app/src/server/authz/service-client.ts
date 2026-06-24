import { Database } from "bun:sqlite";
import { type AuthzClient, createAuthzClient } from "@khoralabs/exedra-authz";

import { createTestAuthzClient } from "./test-service";

let cachedClient: AuthzClient | null | undefined;
let ephemeralAuthzDb: Database | undefined;

function authzServiceUrl(): string | null {
  const value = process.env.AUTHZ_SERVICE_URL?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

function authzServiceToken(): string | null {
  const value =
    process.env.AUTHZ_INTERNAL_TOKEN?.trim() ?? process.env.EXEDRA_INTERNAL_TOKEN?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

export function setAuthzServiceClientForTests(client: AuthzClient | undefined): void {
  cachedClient = client;
}

function createEphemeralAuthzClient(): AuthzClient {
  ephemeralAuthzDb = new Database(":memory:");
  return createTestAuthzClient(ephemeralAuthzDb);
}

export function getAuthzServiceClient(): AuthzClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const baseUrl = authzServiceUrl();
  const token = authzServiceToken();
  if (baseUrl !== null && token !== null) {
    cachedClient = createAuthzClient({ baseUrl, token });
    return cachedClient;
  }

  cachedClient = createEphemeralAuthzClient();
  return cachedClient;
}

export function requireAuthzServiceClient(): AuthzClient {
  const client = getAuthzServiceClient();
  if (client === null) {
    throw new Error("AUTHZ_SERVICE_URL and AUTHZ_INTERNAL_TOKEN must be configured");
  }
  return client;
}

export function resetAuthzServiceClient(): void {
  ephemeralAuthzDb?.close();
  ephemeralAuthzDb = undefined;
  cachedClient = undefined;
}

export function publishAuthzFact(task: Promise<unknown>): void {
  task.catch((error) => {
    console.warn("failed to publish authz fact", error);
  });
}
