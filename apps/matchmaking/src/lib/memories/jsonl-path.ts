import { join } from "node:path";

/**
 * JSONL store path for one namespace (mirrors CLI `-s` file layout; one store per namespace directory).
 * Example: `{root}/namespaces/obp_demo/matchmaking/users/mira-patel/personal/store.jsonl`
 */
export function jsonlStorePathForNamespace(memoriesRoot: string, namespace: string): string {
  return join(memoriesRoot, "namespaces", ...namespace.split("/").filter(Boolean), "store.jsonl");
}
