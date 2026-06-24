import {
  type LabelSchemaMap,
  MemoriesClientAsync,
  type SearchHit,
  type SearchParams,
} from "@khoralabs/memories-core";
import type { MemoriesPersistenceAsync } from "@khoralabs/memories-core/persistence";
import { DEFAULT_MEMORIES_BACKEND_CAPABILITIES } from "@khoralabs/memories-core/persistence";
import {
  deserializeSearchHits,
  type InternalMemoriesAgentSearchRequest,
  type InternalMemoriesAgentSearchResponse,
  type InternalMemoriesProvenanceHeadResponse,
  type SearchParamsWire,
} from "../../../shared/search-hit-wire.ts";
import { exedraMemoriesOntology } from "./exedra-memories-ontology.ts";

export type ExedraHttpMemoriesClientConfig = {
  userId: string;
  orgId?: string;
  baseUrl: string;
  token: string;
};

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      if (text.length > 0) message = text;
    }
    throw new Error(message);
  }
  return JSON.parse(text) as T;
}

function createStubPersistence(config: ExedraHttpMemoriesClientConfig): MemoriesPersistenceAsync {
  const base = config.baseUrl.replace(/\/$/, "");

  return {
    withTransaction: async <T>(fn: () => Promise<T>) => fn(),
    capabilities: DEFAULT_MEMORIES_BACKEND_CAPABILITIES,
    getProvenanceHeadRootHex: async () => {
      const url = new URL(`${base}/internal/memories/provenance-head`);
      url.searchParams.set("userId", config.userId);
      if (config.orgId !== undefined && config.orgId.length > 0) {
        url.searchParams.set("orgId", config.orgId);
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${config.token}` } });
      const data = await readJson<InternalMemoriesProvenanceHeadResponse>(res);
      return data.rootHex.length > 0 ? data.rootHex : undefined;
    },
  } as unknown as MemoriesPersistenceAsync;
}

/** Read-only {@link MemoriesClientAsync} that forwards {@link search} to Exedra internal HTTP. */
export class ExedraHttpMemoriesClientAsync extends MemoriesClientAsync<
  LabelSchemaMap,
  LabelSchemaMap
> {
  readonly #config: ExedraHttpMemoriesClientConfig;

  constructor(config: ExedraHttpMemoriesClientConfig) {
    super(createStubPersistence(config), exedraMemoriesOntology);
    this.#config = config;
  }

  override async search(params: SearchParams): Promise<SearchHit[]> {
    const base = this.#config.baseUrl.replace(/\/$/, "");
    const body: InternalMemoriesAgentSearchRequest = {
      userId: this.#config.userId,
      ...(this.#config.orgId !== undefined && this.#config.orgId.length > 0
        ? { orgId: this.#config.orgId }
        : {}),
      params: params as unknown as SearchParamsWire,
    };
    const res = await fetch(`${base}/internal/memories/agent-search`, {
      method: "POST",
      headers: authHeaders(this.#config.token),
      body: JSON.stringify(body),
    });
    const data = await readJson<InternalMemoriesAgentSearchResponse>(res);
    return deserializeSearchHits(data.hits) as unknown as SearchHit[];
  }

  override async mergeMemory(): Promise<string[]> {
    throw new Error("ExedraHttpMemoriesClientAsync: read-only remote client");
  }

  override async deleteMemory(): Promise<void> {
    throw new Error("ExedraHttpMemoriesClientAsync: read-only remote client");
  }
}

export function createExedraHttpMemoriesClientAsync(
  config: ExedraHttpMemoriesClientConfig,
): ExedraHttpMemoriesClientAsync {
  return new ExedraHttpMemoriesClientAsync(config);
}
