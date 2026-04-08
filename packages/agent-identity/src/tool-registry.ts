import type { AnyComposable } from "./toolkit.js";

export type RegisteredToolEntry = {
  key: string;
  hash: string;
  composable: AnyComposable;
};

export type ToolRegistry = {
  register: (key: string, composable: AnyComposable) => Promise<string>;
  get: (key: string) => RegisteredToolEntry | undefined;
  getByHash: (hash: string) => RegisteredToolEntry | undefined;
  has: (key: string) => boolean;
  listKeys: () => string[];
  entries: () => IterableIterator<[string, RegisteredToolEntry]>;
};

/**
 * In-memory tool registration map keyed by caller string (convention: same as tool name).
 */
export function createToolRegistry(): ToolRegistry {
  const byKey = new Map<string, RegisteredToolEntry>();
  const byHash = new Map<string, RegisteredToolEntry>();

  async function register(
    key: string,
    composable: AnyComposable,
  ): Promise<string> {
    const hash = await composable.computeStaticHash();
    const entry: RegisteredToolEntry = { key, hash, composable };
    byKey.set(key, entry);
    byHash.set(hash, entry);
    return hash;
  }

  function get(key: string): RegisteredToolEntry | undefined {
    return byKey.get(key);
  }

  function getByHash(hash: string): RegisteredToolEntry | undefined {
    return byHash.get(hash);
  }

  function has(key: string): boolean {
    return byKey.has(key);
  }

  function listKeys(): string[] {
    return [...byKey.keys()];
  }

  function entries(): IterableIterator<[string, RegisteredToolEntry]> {
    return byKey.entries();
  }

  return {
    register,
    get,
    getByHash,
    has,
    listKeys,
    entries,
  };
}
