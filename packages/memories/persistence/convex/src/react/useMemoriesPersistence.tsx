import type { MemoriesPersistenceAsync } from "@cfd/memories-core";
import { type ConvexReactClient, useConvex } from "convex/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { convexReactClientToMemoriesClient } from "../convexReactClientBridge.js";
import {
  createConvexMemoriesPersistence,
  type MemoriesConvexApiSlice,
} from "../createConvexMemoriesPersistence.js";

const MemoriesPersistenceContext = createContext<MemoriesPersistenceAsync | null>(null);

export type MemoriesPersistenceProviderProps = {
  children: ReactNode;
  /** Host slice from `components.<name>` (e.g. `components.memories`). */
  componentApi: MemoriesConvexApiSlice;
};

/**
 * Provides memoized {@link MemoriesPersistenceAsync} for descendants.
 * Must be rendered **inside** {@link ConvexProvider} (uses `useConvex()`).
 */
export function MemoriesPersistenceProvider({
  children,
  componentApi,
}: MemoriesPersistenceProviderProps) {
  const convex = useConvex() as ConvexReactClient;
  const persistence = useMemo(
    () => createConvexMemoriesPersistence(convexReactClientToMemoriesClient(convex), componentApi),
    [convex, componentApi],
  );
  return (
    <MemoriesPersistenceContext.Provider value={persistence}>
      {children}
    </MemoriesPersistenceContext.Provider>
  );
}

/**
 * Context value from {@link MemoriesPersistenceProvider}. Requires an ancestor
 * `ConvexProvider` and `MemoriesPersistenceProvider`.
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
