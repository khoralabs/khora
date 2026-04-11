/**
 * Runtime: guides edge targets from prefetch search (varies per run).
 */
export function buildLibrarianPrefetchKeysInstruction(allowedKeys: string[]): string {
  if (allowedKeys.length === 0) {
    return "No prefetch hits. Use **memory_search** as needed; avoid duplicate searches for the same intent.";
  }
  const list = allowedKeys.map((k) => `- \`${k}\``).join("\n");
  return `## Prefetch keys (valid edge targets)
${list}

Prefer these keys for edges; search only if you still need more candidates.`.trim();
}
