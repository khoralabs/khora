import {
  type LabelSchemaMap,
  MemoriesClientAsync,
  type SearchOutput,
  type SearchParams,
} from "@khoralabs/memories-node";
import type { MemoriesPersistenceAsync } from "@khoralabs/memories-node/persistence";
import {
  createBearerTokenAuthProvider,
  createRemoteMemoriesClientAsync,
  type RemoteMemoriesClientAsync,
} from "@khoralabs/memories-service/client";
import { exedraMemoriesOntology } from "./exedra-memories-ontology.ts";

export type ExedraHttpMemoriesClientConfig = {
  userId: string;
  orgId?: string;
  baseUrl: string;
  token: string;
};

function resolveDatabase(config: ExedraHttpMemoriesClientConfig) {
  const orgId = config.orgId?.trim();
  if (orgId !== undefined && orgId.length > 0) {
    return { kind: "organization" as const, ownerKey: orgId };
  }
  return { kind: "account" as const, ownerKey: config.userId };
}

/** Remote {@link MemoriesClientAsync} backed by memories-service HTTP. */
export class ExedraHttpMemoriesClientAsync extends MemoriesClientAsync<
  LabelSchemaMap,
  LabelSchemaMap
> {
  readonly #delegate: RemoteMemoriesClientAsync;

  private constructor(delegate: RemoteMemoriesClientAsync, persistence: MemoriesPersistenceAsync) {
    super(persistence, exedraMemoriesOntology);
    this.#delegate = delegate;
  }

  static async create(
    config: ExedraHttpMemoriesClientConfig,
  ): Promise<ExedraHttpMemoriesClientAsync> {
    const delegate = await createRemoteMemoriesClientAsync({
      baseUrl: config.baseUrl,
      database: resolveDatabase(config),
      ontology: exedraMemoriesOntology,
      auth: createBearerTokenAuthProvider(config.token),
    });
    return new ExedraHttpMemoriesClientAsync(delegate, delegate.persistence);
  }

  override async search(params: SearchParams): Promise<SearchOutput> {
    return this.#delegate.search(params);
  }

  override async mergeMemory(
    params: Parameters<MemoriesClientAsync<LabelSchemaMap, LabelSchemaMap>["mergeMemory"]>[0],
  ): Promise<string[]> {
    return this.#delegate.mergeMemory(params);
  }

  override async deleteMemory(
    params: Parameters<MemoriesClientAsync<LabelSchemaMap, LabelSchemaMap>["deleteMemory"]>[0],
  ): Promise<void> {
    return this.#delegate.deleteMemory(params);
  }
}

export async function createExedraHttpMemoriesClientAsync(
  config: ExedraHttpMemoriesClientConfig,
): Promise<ExedraHttpMemoriesClientAsync> {
  return ExedraHttpMemoriesClientAsync.create(config);
}
