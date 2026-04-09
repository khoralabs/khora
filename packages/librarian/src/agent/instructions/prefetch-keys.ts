/**
 * Runtime: guides edge targets from prefetch search (varies per run).
 */
export function buildLibrarianPrefetchKeysInstruction(allowedKeys: string[]): string {
  if (allowedKeys.length === 0) {
    return "No prefetch hits. Run **one** broad **memory_search** (usually enough); only search again if results are clearly insufficient.";
  }
  const list = allowedKeys.map((k) => `- \`${k}\``).join("\n");
  return `## Prefetch keys (valid edge targets)
${list}

Prefer these keys; use **memory_search** only if you still need more candidates — avoid duplicate searches for the same intent.`.trim();
}
