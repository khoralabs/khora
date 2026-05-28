import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag } from "@khoralabs/cli-kit";
import type { KhoraSearchHit } from "@khoralabs/khora-contracts";

import { withKhoraClient } from "../flows/context.ts";
import { parseTopK } from "../lib/flags.ts";

function formatSearchHit(hit: KhoraSearchHit): string {
  const h = hit.hydrated;
  if (h === undefined) return "hit";
  if (h.kind === "profile") return `profile:${h.entity.username}`;
  if (h.kind === "ghost") return `ghost:${h.postId}`;
  return `${h.kind}:${h.entity.id}`;
}

export async function handleSearch(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const q = strFlag(flags, "q")?.trim();
  if (q === undefined || q.length === 0) {
    throw new Error("--q is required");
  }
  const topK = parseTopK(flags);

  await withKhoraClient(flags, async (client) => {
    const out = await client.search({
      q,
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
