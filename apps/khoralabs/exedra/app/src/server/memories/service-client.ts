import type { MemoriesDatabaseId } from "@khoralabs/memories-service";
import {
  createBearerTokenAuthProvider,
  createRemoteMemoriesClientAsync,
  createRemoteMemoriesReadClient,
  ensureDatabaseOntologyLink,
  MemoriesServiceClient,
  type RemoteMemoriesClientAsync,
  type RemoteMemoriesReadClient,
  storedOntologyFromDefinition,
} from "@khoralabs/memories-service-client";
import { logger } from "../logger.js";
import { exedraMemoriesOntology } from "./exedra-ontology.js";

export type ExedraMemoriesServiceAccess = {
  database: MemoriesDatabaseId;
  client: RemoteMemoriesClientAsync;
  reads: RemoteMemoriesReadClient;
  ontologyHash: string;
};

const exedraStoredOntologySchema = storedOntologyFromDefinition(exedraMemoriesOntology, {
  $id: "https://exedra.khoralabs.com/ontologies/memories",
  title: "Exedra memories ontology",
});

function resolveServiceBaseUrl(): string {
  const raw = process.env.EXEDRA_KNOWLEDGE_SERVICE_URL?.trim();
  if (raw === undefined || raw.length === 0) {
    throw new Error("EXEDRA_KNOWLEDGE_SERVICE_URL is required for hosted memories");
  }
  return raw;
}

function resolveServiceAuth() {
  const token = process.env.EXEDRA_KNOWLEDGE_SERVICE_TOKEN?.trim();
  if (token === undefined || token.length === 0) {
    return undefined;
  }
  return createBearerTokenAuthProvider(token);
}

const clientCache = new Map<string, Promise<ExedraMemoriesServiceAccess>>();

function cacheKey(database: MemoriesDatabaseId): string {
  return `${database.kind}:${database.ownerKey}`;
}

async function openMemoriesServiceAccess(
  database: MemoriesDatabaseId,
): Promise<ExedraMemoriesServiceAccess> {
  const key = cacheKey(database);
  const cached = clientCache.get(key);
  if (cached !== undefined) return cached;

  const pending = (async () => {
    const baseUrl = resolveServiceBaseUrl();
    const auth = resolveServiceAuth();
    const clientOpts = {
      baseUrl,
      database,
      ontology: exedraMemoriesOntology,
      ...(auth ? { auth } : {}),
    };
    const serviceClient = new MemoriesServiceClient(clientOpts);
    const { hash: ontologyHash } = await ensureDatabaseOntologyLink({
      serviceClient,
      database,
      schema: exedraStoredOntologySchema,
      onMismatch: ({ linkedHash, clientHash }) => {
        logger.warn(
          {
            "memories.database.kind": database.kind,
            "memories.database.owner_key": database.ownerKey,
            "memories.ontology.linked_hash": linkedHash,
            "memories.ontology.client_hash": clientHash,
          },
          "memories ontology link differs from Exedra client ontology",
        );
      },
    });
    const client = await createRemoteMemoriesClientAsync(clientOpts);
    const reads = createRemoteMemoriesReadClient(clientOpts);
    return { database, client, reads, ontologyHash };
  })();
  clientCache.set(key, pending);
  return pending;
}

export function orgMemoriesDatabaseId(orgId: string): MemoriesDatabaseId {
  return { kind: "organization", ownerKey: orgId };
}

export function userMemoriesDatabaseId(userId: string): MemoriesDatabaseId {
  return { kind: "account", ownerKey: userId };
}

export async function openOrgMemoriesService(orgId: string): Promise<ExedraMemoriesServiceAccess> {
  return openMemoriesServiceAccess(orgMemoriesDatabaseId(orgId));
}

export async function openUserMemoriesService(
  userId: string,
): Promise<ExedraMemoriesServiceAccess> {
  return openMemoriesServiceAccess(userMemoriesDatabaseId(userId));
}

export function resetMemoriesServiceClientCacheForTests(): void {
  clientCache.clear();
}

export { exedraStoredOntologySchema };
