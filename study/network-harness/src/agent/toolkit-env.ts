import type { KhoraClient } from "@khoralabs/khora-client";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import type { RemoteMemoriesClientAsync } from "@khoralabs/memories-service-client";

import {
  agentMemoriesDatabase,
  createHarnessMemoriesClient,
} from "./tools/memories/_helpers/memories-client.ts";
import { discoverSkillsFromMemories } from "./tools/skills/_helpers/skills.ts";
import type { HarnessToolkitEnv } from "./tools/types.ts";

async function getMemoriesProvenanceHeadRootHex(
  client: RemoteMemoriesClientAsync,
): Promise<string> {
  const fn = client.persistence.getProvenanceHeadRootHex;
  if (fn === undefined) return "";
  const out = await fn.call(client.persistence);
  return out ?? "";
}

export async function createHarnessToolkitEnv(input: {
  memoriesClient?: RemoteMemoriesClientAsync;
  khoraClient?: KhoraClient;
  embeddingModel?: EmbeddingModel;
}): Promise<HarnessToolkitEnv> {
  const env: HarnessToolkitEnv = {
    memoriesClient: input.memoriesClient,
    khoraClient: input.khoraClient,
    embeddingModel: input.embeddingModel,
    embeddingCache: new Map(),
    skills: [],
    activatedSkillNames: new Set(),
  };

  if (input.memoriesClient === undefined) return env;

  env.memoriesSnapshotRootHex =
    (await getMemoriesProvenanceHeadRootHex(input.memoriesClient)) ?? "";
  env.skills = await discoverSkillsFromMemories(input.memoriesClient);
  return env;
}

export async function createHarnessMemoriesClientForAgent(opts: {
  baseUrl: string;
  agentDid: string;
}): Promise<RemoteMemoriesClientAsync> {
  return createHarnessMemoriesClient({
    baseUrl: opts.baseUrl,
    database: agentMemoriesDatabase(opts.agentDid),
  });
}

export function resolveMemoriesServiceBaseUrl(): string | undefined {
  const value =
    process.env.MEMORIES_SERVICE_URL?.trim() ||
    process.env.HARNESS_MEMORIES_BASE_URL?.trim() ||
    process.env.MEMORIES_BASE_URL?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

export type HarnessAgentWorkflowDeps = Pick<
  import("./run-agent-workflow.ts").RunAgentWorkflowDependencies,
  "memoriesClient" | "khoraClient" | "embeddingModel"
>;

export async function createHarnessAgentWorkflowDeps(input: {
  memoriesBaseUrl: string;
  agentDid: string;
  khoraClient?: KhoraClient;
  embeddingModel?: import("@khoralabs/memories-core/helpers").EmbeddingModel;
}): Promise<HarnessAgentWorkflowDeps> {
  return {
    memoriesClient: await createHarnessMemoriesClientForAgent({
      baseUrl: input.memoriesBaseUrl,
      agentDid: input.agentDid,
    }),
    khoraClient: input.khoraClient,
    embeddingModel: input.embeddingModel,
  };
}
