import type { MemoriesPersistenceAsync } from "./async-types";
import type { MemoriesPersistence } from "./types";

/**
 * Wraps a synchronous {@link MemoriesPersistence} so each method returns a `Promise`.
 * **Search and other read paths** work with {@link searchAsync}.
 *
 * **`withTransaction` is not supported**: sync SQLite (and similar) commits when the synchronous
 * callback returns, so async work cannot run inside a real transaction. Use {@link MemoriesClient}
 * / {@link mergeMemory} for local SQLite merges, or a native {@link MemoriesPersistenceAsync} for
 * remote/async stores with {@link MemoriesClientAsync}.
 */
export function wrapSyncMemoriesPersistenceAsAsync(
  sync: MemoriesPersistence,
): MemoriesPersistenceAsync {
  return new Proxy(sync, {
    get(target, prop, receiver) {
      if (prop === "capabilities") {
        return Reflect.get(target, "capabilities", receiver);
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (prop === "withTransaction") {
        return async <T>(_fn: () => Promise<T>): Promise<T> => {
          throw new Error(
            "wrapSyncMemoriesPersistenceAsAsync: withTransaction is not supported for sync-backed async wrappers; use MemoriesClient + mergeMemory for SQLite or a real MemoriesPersistenceAsync backend for mergeMemoryAsync",
          );
        };
      }
      return (...args: unknown[]) =>
        Promise.resolve((value as (...a: unknown[]) => unknown).apply(target, args));
    },
  }) as unknown as MemoriesPersistenceAsync;
}
