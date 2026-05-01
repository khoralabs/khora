import type { MergeMemoryParams, MutationCtxAsync } from "@cfd/memories-core";
import { mergeMemoryAsync } from "@cfd/memories-core";
import type {
  ConvexMemoriesClient,
  MemoriesConvexApiSlice,
} from "./createConvexMemoriesPersistence.js";

/**
 * Convex-only context for a single-transaction merge via the component
 * {@link memoriesConvexApiSlice} `mergeMemoryAtomic` mutation.
 */
export type MergeMemoryConvexAtomicCtx = {
  client: ConvexMemoriesClient;
  refs: MemoriesConvexApiSlice;
};

function isMutationCtxAsync(
  ctx: MutationCtxAsync | MergeMemoryConvexAtomicCtx,
): ctx is MutationCtxAsync {
  return "persistence" in ctx && (ctx as MutationCtxAsync).persistence !== undefined;
}

export async function mergeMemory(
  ctx: MutationCtxAsync,
  params: MergeMemoryParams,
): Promise<string[]>;
export async function mergeMemory(
  ctx: MergeMemoryConvexAtomicCtx,
  params: MergeMemoryParams,
): Promise<string[]>;
export async function mergeMemory(
  ctx: MutationCtxAsync | MergeMemoryConvexAtomicCtx,
  params: MergeMemoryParams,
): Promise<string[]> {
  if (isMutationCtxAsync(ctx)) {
    return mergeMemoryAsync(ctx, params);
  }
  if (params.ontology !== undefined) {
    throw new Error(
      "mergeMemory (Convex atomic): `ontology` is not supported on mergeMemoryAtomic; use mergeMemoryAsync with MutationCtxAsync or omit ontology.",
    );
  }
  const now = Date.now();
  const { client, refs } = ctx;
  return client.mutation(refs.mutations.mergeMemoryAtomic, {
    namespace: params.namespace,
    key: params.key,
    content: params.content.map((c) => ({
      key: c.key,
      text: c.text,
      vector: c.vector !== undefined ? [...c.vector] : undefined,
    })),
    labels: params.labels.map((l) => ({
      kind: l.kind,
      props: l.props as Record<string, unknown>,
    })),
    properties: params.properties,
    edges: params.edges?.map((e) => ({
      memory_key: e.memory_key,
      direction: e.direction,
      label: {
        kind: e.label.kind,
        props: e.label.props as Record<string, unknown>,
      },
      properties: e.properties,
    })),
    searchMetaVector:
      params.searchMetaVector !== undefined ? [...params.searchMetaVector] : undefined,
    now,
  });
}
