import type {
  AtriumMemoriesEntityKind,
  AtriumMemoriesSearchScope,
} from "@khoralabs/atrium-contracts";
import type { AtriumCliContext } from "../flows/context.ts";
import { boolFlag, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

const SEARCH_SCOPE_MODES = ["pathSubtree", "scopeDag", "exactScope"] as const;
type SearchScopeMode = (typeof SEARCH_SCOPE_MODES)[number];

function parseEntityKinds(raw: string | undefined): AtriumMemoriesEntityKind[] {
  if (raw === undefined || raw.trim().length === 0) {
    return ["profiles", "posts", "probes"];
  }
  const map: Record<string, AtriumMemoriesEntityKind> = {
    profiles: "profiles",
    profile: "profiles",
    posts: "posts",
    post: "posts",
    topics: "topics",
    topic: "topics",
    probes: "probes",
    probe: "probes",
  };
  const out: AtriumMemoriesEntityKind[] = [];
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
    throw new Error("atrium search: --include produced an empty list");
  }
  return out;
}

function parseScope(flags: FlagMap): AtriumMemoriesSearchScope {
  const sk = strFlag(flags, "scope")?.toLowerCase();
  if (sk === "raw") {
    const ns = strFlag(flags, "namespace");
    if (ns === undefined || ns.trim().length === 0) {
      throw new Error("atrium search: --scope raw requires --namespace <path>");
    }
    return { kind: "raw", namespace: ns.trim() };
  }
  if (sk === undefined || sk === "multi") {
    return { kind: "multi", includes: parseEntityKinds(strFlag(flags, "include")) };
  }
  if (sk === "profiles") return { kind: "profiles" };
  if (sk === "posts") return { kind: "posts" };
  if (sk === "topics") return { kind: "topics" };
  if (sk === "probes") return { kind: "probes" };
  throw new Error(`Unknown --scope "${sk}" (use multi, profiles, posts, topics, probes, raw)`);
}

function parseSearchScopeMode(flags: FlagMap): SearchScopeMode | undefined {
  const raw = strFlag(flags, "search-scope-mode") ?? strFlag(flags, "searchScopeMode");
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const m = raw.trim() as SearchScopeMode;
  if (!SEARCH_SCOPE_MODES.includes(m)) {
    throw new Error(`Unknown --search-scope-mode "${raw}" (use pathSubtree, scopeDag, exactScope)`);
  }
  return m;
}

function queryStartIndex(positional: string[]): number {
  if (positional[0] === "search") return 1;
  if (positional[0] === "memories" && positional[1] === "search") return 2;
  return 1;
}

export async function runSearchCommand(
  ctx: AtriumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const start = queryStartIndex(positional);
  const query = positional.slice(start).join(" ").trim();
  if (query.length === 0) {
    throw new Error("usage: atrium search <query…>");
  }
  const limitRaw = strFlag(flags, "limit");
  const limit =
    limitRaw !== undefined && limitRaw.length > 0 ? Number.parseInt(limitRaw, 10) : undefined;
  if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
    throw new Error("atrium search: --limit must be a positive integer");
  }
  const minRaw = strFlag(flags, "min-score") ?? strFlag(flags, "minScore");
  const minScore =
    minRaw !== undefined && minRaw.length > 0 ? Number.parseFloat(minRaw) : undefined;
  if (minScore !== undefined && (Number.isNaN(minScore) || minScore < 0 || minScore > 1)) {
    throw new Error("atrium search: min score must be between 0 and 1");
  }

  const scope = parseScope(flags);
  const searchScopeMode = parseSearchScopeMode(flags);
  const hits = await ctx.client.search({
    query,
    scope,
    ...(limit !== undefined ? { limit } : {}),
    ...(minScore !== undefined ? { minScore } : {}),
    ...(searchScopeMode !== undefined ? { searchScopeMode } : {}),
  });

  if (boolFlag(flags, "json")) {
    console.log(JSON.stringify(hits, null, 2));
    return;
  }
  for (const h of hits) {
    console.log(`${h.score.toFixed(4)}\t${h.memory_key}\t${h.source_key}\t${h.kind}`);
  }
}
