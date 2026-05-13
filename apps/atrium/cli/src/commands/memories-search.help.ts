import type { CommandHelp } from "./types.ts";

export const memoriesSearchHelp: CommandHelp = {
  command: "memories search",
  summary:
    "Hybrid Memories search over indexed profiles, posts, and probes (POST /v1/memories/search).",
  args: `atrium memories search <query...> [--scope multi|profiles|posts|topics|probes] [--include profiles,posts,probes] [--limit N] [--min-score 0..1] [--json]
  Default scope is multi over profiles, posts, and probes. Use --include with comma-separated kinds when --scope multi.`,
};
