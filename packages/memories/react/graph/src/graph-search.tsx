import { ScanSearchIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.js";
import { Spinner } from "@/components/ui/spinner.js";
import type { GraphSearchState } from "./projection-types.js";
import { useMemoriesGraphChrome } from "./use-projection.js";

export function graphSearchSummaryLine(
  queryTrimmed: string,
  graphSearch: GraphSearchState | null,
): string {
  if (queryTrimmed.length === 0) return "";
  return graphSearch
    ? `${graphSearch.hitCount} hit${graphSearch.hitCount === 1 ? "" : "s"} · ${graphSearch.relevantKeys.size} in subgraph`
    : "…";
}

/** Search row; reads {@link useMemoriesGraphChrome} — must be under {@link GraphProjectionProvider}. */
export function GraphSearch() {
  const { searchQuery, setSearchQuery, graphSearch, searchLoading } = useMemoriesGraphChrome();
  const summary = graphSearchSummaryLine(searchQuery.trim(), graphSearch);

  return (
    <InputGroup className="w-full">
      <InputGroupInput
        placeholder="Search…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label="Search memories"
      />
      <InputGroupAddon>
        <ScanSearchIcon className="text-muted-foreground" aria-hidden />
      </InputGroupAddon>
      <InputGroupAddon
        align="inline-end"
        className={searchLoading ? "pr-3" : "text-xs font-normal tabular-nums"}
        aria-live={searchLoading ? "polite" : undefined}
      >
        {searchLoading ? (
          <Spinner className="text-muted-foreground" aria-label="Searching" />
        ) : (
          summary || "\u00a0"
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}
