import {
  createNoAuthProvider,
  createRemoteMemoriesClientAsync,
  type RemoteMemoriesClientAsync,
} from "@khoralabs/memories-service-client";
import type { MemoriesDatabaseId } from "@khoralabs/memories-service-storage-core";

export { HARNESS_MEMORY_LINK_LABEL, harnessMemoriesOntology } from "./harness-ontology.ts";

import { harnessMemoriesOntology } from "./harness-ontology.ts";

export async function createHarnessMemoriesClient(opts: {
  baseUrl: string;
  database: MemoriesDatabaseId;
}): Promise<RemoteMemoriesClientAsync> {
  return createRemoteMemoriesClientAsync({
    baseUrl: opts.baseUrl.replace(/\/$/, ""),
    database: opts.database,
    ontology: harnessMemoriesOntology,
    auth: createNoAuthProvider(),
  });
}

export function agentMemoriesDatabase(agentDid: string): MemoriesDatabaseId {
  return { kind: "account", ownerKey: agentDid };
}
