import type { ToolkitResult } from "./types.js";

/**
 * Merges composable `evaluated.instructions` with per-tool {@link ToolSpec.instructions},
 * skipping tool blocks already embedded verbatim in the merged string.
 */
export function assembleToolkitAgentInstructions(
  evaluated: Pick<ToolkitResult, "tools" | "instructions">,
): string {
  const merged = evaluated.instructions.trim();
  const parts: string[] = [];
  if (merged) parts.push(merged);
  for (const name of Object.keys(evaluated.tools).sort()) {
    const spec = evaluated.tools[name];
    if (!spec) continue;
    const t = spec.instructions.trim();
    if (!t) continue;
    if (t === merged) continue;
    if (merged.includes(t)) continue;
    parts.push(`## ${name}\n${t}`);
  }
  return parts.join("\n\n");
}
