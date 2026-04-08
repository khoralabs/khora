/**
 * Runtime: guides edge targets from prefetch search (varies per run).
 */
export function buildLibrarianPrefetchKeysInstruction(allowedKeys: string[]): string {
  if (allowedKeys.length === 0) {
    return "No prefetch hits; use **memory_search** to find existing memories before choosing edge targets.";
  }
  const list = allowedKeys.map((k) => `- \`${k}\``).join("\n");
  return `## Candidate memory keys from prefetch (edges must use existing keys)
${list}

You may also discover keys via **memory_search**.`.trim();
}
