import type { ConvexReactClient } from "convex/react";
import type { ConvexMemoriesClient } from "./createConvexMemoriesPersistence.js";

/**
 * Adapts {@link ConvexReactClient} (or the return value of `useConvex()`) to {@link ConvexMemoriesClient}
 * for {@link createConvexMemoriesPersistence}. Component function refs are often `internal`; this uses a typed boundary cast.
 */
export function convexReactClientToMemoriesClient(convex: ConvexReactClient): ConvexMemoriesClient {
  return {
    query: (ref: unknown, args: unknown) => convex.query(ref as never, args as never),
    mutation: (ref: unknown, args: unknown) => convex.mutation(ref as never, args as never),
    action: (ref: unknown, args: unknown) => convex.action(ref as never, args as never),
  } as unknown as ConvexMemoriesClient;
}
