import { policy, tool, toolkit } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import type { ExedraInternalClient } from "./exedra-internal-client.ts";
import type { GenerateResponsePolicyState } from "./policies.ts";

export type MemorySearchHit = {
  namespace: string;
  key: string;
  snippet: string;
  score?: number;
  provenance?: unknown;
};

export type GenerateResponseToolkitEnv = {
  policyState: GenerateResponsePolicyState;
  memoryClient: MemoryClient;
};

export type MemoryClient = {
  searchMemories(input: { namespace: string; query: string }): Promise<MemorySearchHit[]>;
  getMemoryProvenance(input: { namespace: string; key: string }): Promise<unknown>;
};

export function createExedraMemoryClient(client: ExedraInternalClient): MemoryClient {
  return {
    searchMemories: async (input) => {
      const result = await client.post<{ hits: MemorySearchHit[] }>(
        "/internal/memories/search",
        input,
      );
      return result.hits;
    },
    getMemoryProvenance: async (input) =>
      client.post<unknown>("/internal/memories/provenance", input),
  };
}

const hasMemoryNamespaces = policy(
  "has-memory-namespaces",
  async (env: GenerateResponseToolkitEnv) =>
    Promise.resolve(env.policyState.memoryNamespaces.length > 0),
);

const namespaceInput = z.object({
  namespace: z.string().min(1).describe("One of the authorized memory namespaces."),
});

function assertNamespace(env: GenerateResponseToolkitEnv, namespace: string): void {
  if (!env.policyState.memoryNamespaces.some((item) => item.namespace === namespace)) {
    throw new Error(`memory namespace is not authorized: ${namespace}`);
  }
}

const searchMemoriesTool = tool<
  "searchMemories",
  { namespace: string; query: string },
  { hits: MemorySearchHit[] },
  GenerateResponseToolkitEnv
>({
  name: "searchMemories",
  description:
    "Search authorized memory namespaces for relevant context. Only use namespaces named in the instructions.",
  inputSchema: namespaceInput.extend({
    query: z.string().min(1).describe("Natural language search query"),
  }),
  policies: [hasMemoryNamespaces],
  handler: async (ctx, input) => {
    const namespace = input.namespace.trim();
    assertNamespace(ctx.env, namespace);
    const hits = await ctx.env.memoryClient.searchMemories({
      namespace,
      query: input.query.trim(),
    });
    return { hits };
  },
});

const getMemoryProvenanceTool = tool<
  "getMemoryProvenance",
  { namespace: string; key: string },
  { provenance: unknown },
  GenerateResponseToolkitEnv
>({
  name: "getMemoryProvenance",
  description: "Fetch provenance for a memory result when attribution or audit context is needed.",
  inputSchema: namespaceInput.extend({
    key: z.string().min(1).describe("Memory key returned by searchMemories"),
  }),
  policies: [hasMemoryNamespaces],
  handler: async (ctx, input) => {
    const namespace = input.namespace.trim();
    assertNamespace(ctx.env, namespace);
    return {
      provenance: await ctx.env.memoryClient.getMemoryProvenance({
        namespace,
        key: input.key.trim(),
      }),
    };
  },
});

export const memoryToolkit = toolkit([searchMemoriesTool, getMemoryProvenanceTool], {
  name: "generate-response-memory",
});
