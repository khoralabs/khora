import type { MemoriesPersistenceAsync } from "@cfd/memories-core";
import type { ConvexReactClient } from "convex/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { convexReactClientToMemoriesClient } from "../convexReactClientBridge.js";
import {
  createConvexMemoriesPersistence,
  type MemoriesConvexApiSlice,
} from "../createConvexMemoriesPersistence.js";

const MemoriesPersistenceContext = createContext<MemoriesPersistenceAsync | null>(null);

export type MemoriesPersistenceProviderProps = {
  children: ReactNode;
  /** Same instance passed to `<ConvexProvider client={...}>`. */
  client: ConvexReactClient;
  /**
   * References for the mounted memories component. In the browser use `memoriesConvexHostRefsFromApi(api)`;
   * raw `components.memories` refs break `ConvexReactClient` query/mutation/action.
   */
  componentApi: MemoriesConvexApiSlice;
};

/**
 * Provides memoized {@link MemoriesPersistenceAsync} for descendants.
 *
 * Pass the **same** {@link ConvexReactClient} you give to {@link ConvexProvider}. This
 * intentionally avoids `useConvex()` inside the package so bundlers (e.g. Bun HTML imports)
 * cannot load a second `react` instance via `convex/react` and break hooks (`dispatcher.useContext`).
 */
export function MemoriesPersistenceProvider({
  children,
  client,
  componentApi,
}: MemoriesPersistenceProviderProps) {
  const persistence = useMemo(
    () => createConvexMemoriesPersistence(convexReactClientToMemoriesClient(client), componentApi),
    [client, componentApi],
  );
  return (
    <MemoriesPersistenceContext.Provider value={persistence}>
      {children}
    </MemoriesPersistenceContext.Provider>
  );
}

/**
 * Context value from {@link MemoriesPersistenceProvider}. Requires an ancestor
 * `ConvexProvider` (same `client` as the provider) and `MemoriesPersistenceProvider`.
 */
export function useMemoriesPersistence(): MemoriesPersistenceAsync {
  const value = useContext(MemoriesPersistenceContext);
  if (value === null) {
    throw new Error(
      "useMemoriesPersistence must be used within MemoriesPersistenceProvider (inside ConvexProvider)",
    );
  }
  return value;
}
