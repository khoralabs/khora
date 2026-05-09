import { join } from "node:path";

export function jsonlStorePathForNamespace(memoriesRoot: string, namespace: string): string {
  return join(memoriesRoot, "namespaces", ...namespace.split("/").filter(Boolean), "store.jsonl");
}
