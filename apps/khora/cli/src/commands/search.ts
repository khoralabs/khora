import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag } from "@khoralabs/cli-kit";
import type { KhoraSearchHit } from "@khoralabs/khora-contracts";

import { withKhoraClient } from "../flows/context";
import { parseTopK, queryFromFlags } from "../lib/flags";

function formatSearchHit(hit: KhoraSearchHit): string {
  const h = hit.hydrated;
  if (h === undefined) return "hit";
  if (h.kind === "profile") return `profile:${h.entity.username}`;
  if (h.kind === "ghost") return `ghost:${h.postId}`;
  return `${h.kind}:${h.entity.id}`;
}

export async function handleSearch(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const query = queryFromFlags(flags);
  if (query === undefined) {
    throw new Error("--query is required");
  }
  const topK = parseTopK(flags);

  await withKhoraClient(flags, async (client) => {
    const out = await client.search({
      q: query,
      ...(topK !== undefined ? { topK } : {}),
    });
    if (json) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    if (out.hits.length === 0) {
      console.log("No hits.");
      return;
    }
    for (const hit of out.hits) {
      const label = formatSearchHit(hit);
      console.log(`- ${label} (score=${hit.score})`);
    }
  });
}
