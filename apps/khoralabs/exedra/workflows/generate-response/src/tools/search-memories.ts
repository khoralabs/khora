import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { hasMemoryNamespaces } from "../policies/memory-namespace-policy.ts";
import { assertAuthorizedMemoryNamespace } from "./assert-namespace.ts";
import type { GenerateResponseToolkitEnv, MemorySearchHit } from "./types.ts";

export const searchMemoriesTool = tool<
  "searchMemories",
  { namespace: string; query: string },
  { hits: MemorySearchHit[] },
  GenerateResponseToolkitEnv
>({
  name: "searchMemories",
  description:
    "Search available memory namespaces for relevant context. Use namespace values named in the instructions.",
  inputSchema: z.object({
    namespace: z.string().min(1).describe("One of the available memory namespaces."),
    query: z.string().min(1).describe("Natural language search query"),
  }),
  policies: [hasMemoryNamespaces],
  handler: async (ctx, input) => {
    const namespace = input.namespace.trim();
    assertAuthorizedMemoryNamespace(ctx.env, namespace);
    const hits = await ctx.env.memoryClient.searchMemories({
      namespace,
      query: input.query.trim(),
    });
    return { hits };
  },
});
