import { join } from "node:path";

/**
 * Default JSONL mirror path for a Memories namespace when using `JsonlStore` from
 * `@cfd/memories-stores` (optional dependency). One persistence layout among many.
 */
export function jsonlStorePathForNamespace(memoriesRoot: string, namespace: string): string {
  return join(memoriesRoot, "namespaces", ...namespace.split("/").filter(Boolean), "store.jsonl");
}
