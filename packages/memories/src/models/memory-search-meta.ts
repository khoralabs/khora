export {
  isSystemSearchMetaSourceKey,
  MEMORY_SEARCH_META_SOURCE_KEY,
} from "../search-meta-constants";

function sortUnique(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b));
}

function formatNodeLines(labels: string[]): string[] {
  return sortUnique(labels).map((l) => `node:${l}`);
}

function formatEdgeLine(
  direction: "in" | "out",
  neighborKey: string,
  edgeLabels: string[],
): string {
  const joined = sortUnique(edgeLabels).join("|");
  return `edge ${direction}:${neighborKey}:${joined}`;
}

/** Build the same canonical multiline string as DB/search-meta text from merge payload (pre-DB). */
export function buildCanonicalMemorySearchMetaTextForMerge(input: {
  labels: string[];
  edges: Array<{ memory_key: string; direction: "in" | "out"; label: string }>;
}): string {
  const nodeLines = formatNodeLines(input.labels);
  const edgeLines = sortUnique(
    input.edges.map((e) => formatEdgeLine(e.direction, e.memory_key, [e.label])),
  );
  const lines = [...nodeLines, ...edgeLines].sort((a, b) => a.localeCompare(b));
  return lines.join("\n");
}
