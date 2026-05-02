import type { StandardSchemaV1 } from "@standard-schema/spec";

function segmentKey(seg: PropertyKey | StandardSchemaV1.PathSegment): PropertyKey {
  return typeof seg === "object" ? seg.key : seg;
}

function formatPath(path: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment>): string {
  if (path.length === 0) {
    return "(root)";
  }
  const parts: string[] = [];
  for (const seg of path) {
    const key = segmentKey(seg);
    if (typeof key === "number") {
      parts.push(`[${key}]`);
      continue;
    }
    const s = String(key);
    parts.push(parts.length === 0 ? s : `.${s}`);
  }
  return parts.join("");
}

/**
 * Human- and agent-readable multi-line message from a Standard Schema failure. Lists each
 * issue prefixed by its path so an agent can correct the offending field on retry.
 */
export function formatStandardSchemaIssuesForAgent(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): string {
  if (issues.length === 0) {
    return "(no issues)";
  }
  const first = issues[0];
  const lines: string[] = [];
  if (first !== undefined) {
    lines.push(first.message);
    lines.push("");
  }
  for (const i of issues) {
    lines.push(`- ${formatPath(i.path ?? [])}: ${i.message}`);
  }
  return lines.join("\n");
}
