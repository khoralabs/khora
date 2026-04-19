import {
  createConvexLexicalTextStore,
  createMemoriesPersistence,
  hostComponentBridgeFromCtx,
  mergeMemory,
  search,
} from "@cfd/memories-convex";
import type { SourceMap } from "@cfd/memories-core/persistence";
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { mutation, query } from "./_generated/server.js";

export type { HostComponentBridge } from "@cfd/memories-convex";
export {
  createConvexMemoriesPersistenceFromHostBridge,
  createMemoriesPersistence,
  hostComponentBridgeFromActionCtx,
  hostComponentBridgeFromCtx,
  hostComponentBridgeFromMutationCtx,
  hostComponentBridgeFromQueryCtx,
} from "@cfd/memories-convex";

const DEMO_NS = "demo";

/** Lexical search cap (must match demo UI copy and `searchMemories` below). */
export const DEMO_SEARCH_TOP_K = 20;

export const addMemory = mutation({
  args: { text: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const { persistence } = createMemoriesPersistence(ctx, components.memories);
    return mergeMemory(
      { persistence },
      {
        namespace: DEMO_NS,
        key: crypto.randomUUID(),
        labels: [],
        content: [{ key: "body", text: args.text }],
      },
    );
  },
});

export const searchMemories = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    const q = args.q.trim();
    if (q === "") return [];

    const { persistence, bridge } = createMemoriesPersistence(ctx, components.memories);
    const hits = await search(
      { persistence },
      {
        namespace: DEMO_NS,
        content: { text: q },
        options: { topK: DEMO_SEARCH_TOP_K, neighbors: false },
      },
    );
    const store = createConvexLexicalTextStore(
      bridge.runQuery,
      components.memories.queries.getLexicalTextForMemorySource,
    );
    return Promise.all(
      hits.map(async (h) => {
        const resolved = await store.resolve(h as SourceMap);
        const contentText = resolved.kind === "string" ? resolved.string : "";
        return { ...h, contentText };
      }),
    );
  },
});

export const listDemoMemories = query({
  args: {},
  returns: v.array(
    v.object({
      memoryId: v.string(),
      key: v.string(),
      tsCreated: v.number(),
      bodyText: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const bridge = hostComponentBridgeFromCtx(ctx);
    return bridge.runQuery(components.memories.queries.listMemoriesInNamespace, {
      namespace: DEMO_NS,
    }) as Promise<
      Array<{ memoryId: string; key: string; tsCreated: number; bodyText: string | null }>
    >;
  },
});
