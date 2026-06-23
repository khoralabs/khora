import type { ExedraInternalClient } from "../exedra-internal-client.ts";
import type { MemoryClient, MemorySearchHit } from "./types.ts";

export function createExedraMemoryClient(client: ExedraInternalClient): MemoryClient {
  return {
    searchMemories: async (input) => {
      const result = await client.post<{ hits: MemorySearchHit[] }>(
        "/internal/memories/search",
        input,
      );
      return result.hits;
    },
    getMemoryProvenance: async (input) =>
      client.post<unknown>("/internal/memories/provenance", input),
  };
}
