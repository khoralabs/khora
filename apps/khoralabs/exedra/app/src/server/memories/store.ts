import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";
import {
  type ExedraMemoriesServiceAccess,
  resetMemoriesServiceClientCacheForTests,
} from "./service-client.js";

/** @deprecated Local SQLite store removed; use {@link openOrgMemoriesService} / {@link openUserMemoriesService}. */
export function openOrgMemories(): never {
  throw new Error("Local memories store removed; configure EXEDRA_KNOWLEDGE_SERVICE_URL");
}

/** @deprecated Local SQLite store removed; use {@link openOrgMemoriesService} / {@link openUserMemoriesService}. */
export function openUserMemories(): never {
  throw new Error("Local memories store removed; configure EXEDRA_KNOWLEDGE_SERVICE_URL");
}

export function resetMemoriesStoreForTests(): void {
  resetMemoriesServiceClientCacheForTests();
}

export type { ExedraMemoriesServiceAccess, RemoteMemoriesClientAsync };
