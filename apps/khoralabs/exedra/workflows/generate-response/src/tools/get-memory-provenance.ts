import { tool } from "@khoralabs/agent-capabilities";
import { z } from "zod";

import { hasMemoryNamespaces } from "../policies/memory-namespace-policy.ts";
import { assertAuthorizedMemoryNamespace } from "./assert-namespace.ts";
import type { GenerateResponseToolkitEnv } from "./types.ts";

export const getMemoryProvenanceTool = tool<
  "getMemoryProvenance",
  { namespace: string; key: string },
  { provenance: unknown },
  GenerateResponseToolkitEnv
>({
  name: "getMemoryProvenance",
  description: "Fetch provenance for a memory result when attribution or audit context is needed.",
  inputSchema: z.object({
    namespace: z.string().min(1).describe("One of the available memory namespaces."),
    key: z.string().min(1).describe("Memory key returned by searchMemories"),
  }),
  policies: [hasMemoryNamespaces],
  handler: async (ctx, input) => {
    const namespace = input.namespace.trim();
    assertAuthorizedMemoryNamespace(ctx.env, namespace);
    return {
      provenance: await ctx.env.memoryClient.getMemoryProvenance({
        namespace,
        key: input.key.trim(),
      }),
    };
  },
});
