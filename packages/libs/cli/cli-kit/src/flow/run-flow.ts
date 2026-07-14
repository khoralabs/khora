import type { ReadLineFn } from "../readline-session";
import type { FlowDefinition, FlowField } from "./types";

export type RunFlowOptions = {
  readLine: ReadLineFn;
  def: FlowDefinition;
  /** Pre-filled answers keyed by field id (e.g. CLI flags). */
  partialSeeds?: Readonly<Record<string, string | undefined>>;
};

function seedFor(fieldId: string, seeds: RunFlowOptions["partialSeeds"]): string | undefined {
  const t = seeds?.[fieldId]?.trim();
  return t !== undefined && t.length > 0 ? t : undefined;
}

function resolvedAfterValid(field: FlowField, raw: string): string | undefined {
  const t = raw.trim();
  if (field.optional === true && t.length === 0) return undefined;
  return t;
}

function isAcceptable(field: FlowField, raw: string): boolean {
  const t = raw.trim();
  if (field.optional === true) return true;
  return t.length > 0;
}

/**
 * Run a linear questionnaire: for each field, use a seed if acceptable, else readline until valid.
 */
export async function runFlow(
  options: RunFlowOptions,
): Promise<Record<string, string | undefined>> {
  const { readLine, def, partialSeeds } = options;
  const out: Record<string, string | undefined> = {};

  for (const field of def.fields) {
    const candidate = seedFor(field.id, partialSeeds);
    let settled = false;
    let resolved: string | undefined;

    if (candidate !== undefined && isAcceptable(field, candidate)) {
      resolved = resolvedAfterValid(field, candidate);
      settled = true;
    }

    while (!settled) {
      const line = await readLine(field.prompt);
      if (isAcceptable(field, line)) {
        resolved = resolvedAfterValid(field, line);
        settled = true;
      }
    }

    out[field.id] = resolved;
  }

  return out;
}

/** Required string field after {@link runFlow} (guard + clearer errors). */
export function requireFlowString(
  row: Record<string, string | undefined>,
  fieldId: string,
  message?: string,
): string {
  const v = row[fieldId]?.trim() ?? "";
  if (v.length === 0) {
    throw new Error(message ?? `${fieldId} is required`);
  }
  return v;
}
