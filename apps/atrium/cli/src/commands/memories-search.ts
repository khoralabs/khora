import type { SwarmHostMemoryEntityKind, SwarmHostSearchScope } from "@khoralabs/swarm-host";
import type { AtriumCliContext } from "../flows/context.ts";
import { boolFlag, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

function parseEntityKinds(raw: string | undefined): SwarmHostMemoryEntityKind[] {
  if (raw === undefined || raw.trim().length === 0) {
    return ["profiles", "posts", "probes"];
  }
  const map: Record<string, SwarmHostMemoryEntityKind> = {
    profiles: "profiles",
    profile: "profiles",
    posts: "posts",
    post: "posts",
    topics: "topics",
    topic: "topics",
    probes: "probes",
    probe: "probes",
  };
  const out: SwarmHostMemoryEntityKind[] = [];
  for (const p of raw.split(",")) {
    const k = map[p.trim().toLowerCase()];
    if (k === undefined) {
      throw new Error(
        `Unknown --include segment "${p.trim()}" (use profiles, posts, topics, probes)`,
      );
    }
    if (!out.includes(k)) out.push(k);
  }
  if (out.length === 0) {
    throw new Error("atrium memories search: --include produced an empty list");
  }
  return out;
}

function parseScope(flags: FlagMap): SwarmHostSearchScope {
  const sk = strFlag(flags, "scope")?.toLowerCase();
  if (sk === undefined || sk === "multi") {
    return { kind: "multi", includes: parseEntityKinds(strFlag(flags, "include")) };
  }
  if (sk === "profiles") return { kind: "profiles" };
  if (sk === "posts") return { kind: "posts" };
  if (sk === "topics") return { kind: "topics" };
  if (sk === "probes") return { kind: "probes" };
  throw new Error(`Unknown --scope "${sk}" (use multi, profiles, posts, topics, probes)`);
}

export async function runMemoriesSearchCommand(
  ctx: AtriumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const query = positional.slice(2).join(" ").trim();
  if (query.length === 0) {
    throw new Error("usage: atrium memories search <query…>");
  }
  const limitRaw = strFlag(flags, "limit");
  const limit =
    limitRaw !== undefined && limitRaw.length > 0 ? Number.parseInt(limitRaw, 10) : undefined;
  if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
    throw new Error("atrium memories search: --limit must be a positive integer");
  }
  const minRaw = strFlag(flags, "min-score") ?? strFlag(flags, "minScore");
  const minScore =
    minRaw !== undefined && minRaw.length > 0 ? Number.parseFloat(minRaw) : undefined;
  if (minScore !== undefined && (Number.isNaN(minScore) || minScore < 0 || minScore > 1)) {
    throw new Error("atrium memories search: min score must be between 0 and 1");
  }

  const scope = parseScope(flags);
  const hits = await ctx.client.searchMemories({
    query,
    scope,
    ...(limit !== undefined ? { limit } : {}),
    ...(minScore !== undefined ? { minScore } : {}),
  });

  if (boolFlag(flags, "json")) {
    console.log(JSON.stringify(hits, null, 2));
    return;
  }
  for (const h of hits) {
    console.log(`${h.score.toFixed(4)}\t${h.memory_key}\t${h.source_key}\t${h.kind}`);
  }
}
