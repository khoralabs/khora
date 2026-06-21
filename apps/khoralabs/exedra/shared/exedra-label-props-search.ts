import type { LabelPropsSearchFormatter, LabelPropsSearchRole } from "@khoralabs/memories-core";

function formatFeatures(features: unknown): string {
  if (!Array.isArray(features)) return "";
  const lines: string[] = [];
  for (const item of features) {
    if (typeof item !== "object" || item === null) continue;
    const aspect = (item as { aspect?: unknown }).aspect;
    const statement = (item as { statement?: unknown }).statement;
    if (typeof aspect !== "string" || typeof statement !== "string") continue;
    if (aspect.length === 0 || statement.length === 0) continue;
    lines.push(`${aspect}: ${statement}`);
  }
  return lines.join("\n");
}

/** Readable lines for Exedra ontology kinds in label-props lexical indexing. */
export const exedraLabelPropsSearchFormatter: LabelPropsSearchFormatter = (
  kind: string,
  role: LabelPropsSearchRole,
  props: Record<string, unknown>,
): string => {
  if (kind === "memory" && role === "node") {
    const parts: string[] = ["Memory node."];
    if (typeof props.source === "string" && props.source.length > 0) {
      parts.push(`Source: ${props.source}.`);
    }
    const features = formatFeatures(props.features);
    if (features.length > 0) parts.push(features);
    return parts.join("\n");
  }
  if (kind === "related" && role === "edge") {
    const parts: string[] = [];
    if (typeof props.context === "string" && props.context.length > 0) {
      parts.push(`Related: ${props.context}`);
    }
    if (typeof props.confidence === "string") {
      parts.push(`Confidence: ${props.confidence}`);
    }
    const features = formatFeatures(props.features);
    if (features.length > 0) parts.push(features);
    return parts.join("\n");
  }
  return "";
};
