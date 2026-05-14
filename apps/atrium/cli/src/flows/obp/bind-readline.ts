import {
  type BindPolicyField,
  bindPayloadSchemaForProperties,
  bindPolicySlugKeys,
  formatStandardSchemaIssuesForAgent,
  type PortBindPolicy,
} from "@khoralabs/obp-v2-nbc";

export type ReadLineFn = (prompt: string) => Promise<string>;

function parseBool(raw: string): boolean | undefined {
  const t = raw.trim().toLowerCase();
  if (t === "") return undefined;
  if (["y", "yes", "true", "1"].includes(t)) return true;
  if (["n", "no", "false", "0"].includes(t)) return false;
  return undefined;
}

/**
 * Prompt for each bind-policy property in order; validate with NBC Standard Schema (same rules as hosts).
 */
export async function readBindPolicyInteractive(
  bindPolicy: PortBindPolicy,
  readLine: ReadLineFn,
): Promise<Record<string, unknown>> {
  const keys = bindPolicySlugKeys(bindPolicy.properties);
  const record: Record<string, unknown> = {};

  for (let i = 0; i < bindPolicy.properties.length; i++) {
    const field = bindPolicy.properties[i];
    const key = keys[i];
    if (field === undefined || key === undefined) continue;

    const hint = formatFieldHint(field);
    const raw = await readLine(`${field.prompt}${hint}\n> `);

    switch (field.type) {
      case "text": {
        const trimmed = raw.trim();
        if (trimmed === "" && field.optional) {
          break;
        }
        record[key] = trimmed;
        break;
      }
      case "boolean": {
        if (raw.trim() === "" && field.optional) {
          break;
        }
        const b = parseBool(raw);
        if (b === undefined) {
          throw new Error(`Expected y/n (got: ${raw.trim() || "(empty)"})`);
        }
        record[key] = b;
        break;
      }
      case "int": {
        if (raw.trim() === "" && field.optional) {
          break;
        }
        const n = Number.parseInt(raw.trim(), 10);
        if (Number.isNaN(n)) {
          throw new Error(`Expected integer (got: ${raw.trim()})`);
        }
        record[key] = n;
        break;
      }
      case "float": {
        if (raw.trim() === "" && field.optional) {
          break;
        }
        const n = Number.parseFloat(raw.trim());
        if (Number.isNaN(n)) {
          throw new Error(`Expected number (got: ${raw.trim()})`);
        }
        record[key] = n;
        break;
      }
      case "choice": {
        const choices = field.constraints.choices;
        const maxSel = field.constraints.maxSelections ?? 1;
        if (raw.trim() === "" && field.optional) {
          break;
        }
        if (raw.trim() === "" && !field.optional && maxSel <= 1) {
          throw new Error(`Pick one of: ${choices.join(", ")}`);
        }
        if (maxSel <= 1) {
          const pick = raw.trim();
          if (!choices.includes(pick)) {
            throw new Error(`Pick one of: ${choices.join(", ")}`);
          }
          record[key] = pick;
        } else {
          const parts = raw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          for (const p of parts) {
            if (!choices.includes(p)) {
              throw new Error(`Invalid choice "${p}". Options: ${choices.join(", ")}`);
            }
          }
          record[key] = parts;
        }
        break;
      }
      default: {
        const _x: never = field;
        throw new Error(`Unsupported bind field type: ${(_x as BindPolicyField).type}`);
      }
    }
  }

  const schema = bindPayloadSchemaForProperties(bindPolicy.properties);
  const out = schema["~standard"].validate(record);
  if (out instanceof Promise) {
    throw new TypeError("expected synchronous bind_payload validation");
  }
  if ("issues" in out && out.issues !== undefined && out.issues.length > 0) {
    throw new Error(formatStandardSchemaIssuesForAgent(out.issues));
  }
  if (!("value" in out) || out.value === undefined) {
    throw new Error("bind_payload validation produced no value");
  }
  return out.value;
}

function formatFieldHint(field: BindPolicyField): string {
  if (field.type === "choice") {
    const ch = field.constraints.choices;
    const ms = field.constraints.maxSelections ?? 1;
    return ms > 1 ? ` [${ch.join(" | ")}, comma-separated, max ${ms}]` : ` [${ch.join(" | ")}]`;
  }
  if (field.optional) {
    return " (optional, empty to skip)";
  }
  return "";
}
