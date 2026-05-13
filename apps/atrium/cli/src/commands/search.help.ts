import type { CommandHelp } from "./types.ts";

export const searchHelp: CommandHelp = {
  command: "search",
  summary:
    "Hybrid search over indexed profiles, posts, and probes (POST /v1/memories/search). DAG buckets: use --scope raw --namespace atrium/<profileId> or atrium/<topicSlug> with --search-scope-mode scopeDag.",
  args: `atrium search <query...> [--scope multi|profiles|posts|topics|probes|raw] [--namespace <path>] [--include profiles,posts,probes] [--search-scope-mode pathSubtree|scopeDag|exactScope] [--limit N] [--min-score 0..1] [--json]
  Default scope is multi over profiles, posts, and probes. Use --include with comma-separated kinds when --scope multi.
  For DAG read-model roots (posts attached under profile/topic scopes), pass --scope raw --namespace atrium/<segment>[/…] --search-scope-mode scopeDag.`,
};

export const memoriesSearchDeprecatedHelp: CommandHelp = {
  command: "memories search",
  summary: "Deprecated alias for `atrium search` (same HTTP endpoint).",
  args: `Use: atrium search <query...> (see "atrium search --help").`,
};
