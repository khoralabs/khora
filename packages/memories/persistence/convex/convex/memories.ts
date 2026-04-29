/**
 * Re-exports for host Convex code that wires the memories **component** (`components.memories`).
 * The Bun example UI uses client-side `mergeMemory`, `search`, and `memoriesConvexHostRefsFromApi(api)`
 * so `ConvexReactClient` calls use host `api.memoriesHost*` forwards (not raw `components.*` refs).
 */
export type { HostComponentBridge } from "@cfd/memories-convex";
export {
  createConvexMemoriesPersistenceFromHostBridge,
  createMemoriesPersistence,
  hostComponentBridgeFromActionCtx,
  hostComponentBridgeFromCtx,
  hostComponentBridgeFromMutationCtx,
  hostComponentBridgeFromQueryCtx,
} from "@cfd/memories-convex";
