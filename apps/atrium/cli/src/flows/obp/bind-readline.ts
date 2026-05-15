import type { JsonDocument } from "@khoralabs/obp-v2-model";
import { validateVellumBindPayloadForPort } from "@khoralabs/vellum-bind-policy";

export type ReadLineFn = (prompt: string) => Promise<string>;

function parseBool(raw: string): boolean | undefined {
  const t = raw.trim().toLowerCase();
  if (t === "") return undefined;
  if (["y", "yes", "true", "1"].includes(t)) return true;
  if (["n", "no", "false", "0"].includes(t)) return false;
  return undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function promptLabel(sub: Record<string, unknown>, propKey: string): string {
  const d = sub.description;
  if (typeof d === "string" && d.trim() !== "") return d;
  const t = sub.title;
  if (typeof t === "string" && t.trim() !== "") return t;
  return propKey;
}

function hintForSchema(sub: Record<string, unknown>): string {
  if (sub.type === "string" && Array.isArray(sub.enum)) {
    const en = sub.enum as unknown[];
    const opts = en.filter((x): x is string => typeof x === "string");
    return ` [${opts.join(" | ")}]`;
  }
  if (sub.type === "array" && isPlainObject(sub.items)) {
    const it = sub.items;
    if (Array.isArray(it.enum)) {
      const opts = (it.enum as unknown[]).filter((x): x is string => typeof x === "string");
      const max = typeof sub.maxItems === "number" ? sub.maxItems : undefined;
      return max !== undefined && max > 1
        ? ` [${opts.join(" | ")}, comma-separated, max ${max}]`
        : ` [${opts.join(" | ")}]`;
    }
  }
  return "";
}

/**
 * Prompt for each **`properties`** entry on a JSON Schema root (`type: object`), then validate with {@link validateVellumBindPayloadForPort}.
 */
export async function readBindPolicyInteractive(
  bindPolicy: JsonDocument,
  readLine: ReadLineFn,
): Promise<Record<string, unknown>> {
  if (!isPlainObject(bindPolicy)) {
    throw new Error("bind_policy must be an object (JSON Schema)");
  }
  if (bindPolicy.type !== "object") {
    throw new Error('bind_policy root must have type: "object"');
  }
  if (!isPlainObject(bindPolicy.properties)) {
    throw new Error("bind_policy must include a properties object");
  }

  const props = bindPolicy.properties as Record<string, Record<string, unknown>>;
  const required = new Set(
    Array.isArray(bindPolicy.required)
      ? bindPolicy.required.filter((x) => typeof x === "string")
      : [],
  );

  const record: Record<string, unknown> = {};

  for (const propKey of Object.keys(props)) {
    const sub = props[propKey];
    if (!isPlainObject(sub)) continue;

    const label = promptLabel(sub, propKey);
    const optional = !required.has(propKey);
    const hint = hintForSchema(sub);
    const raw = await readLine(
      `${label}${optional ? " (optional, empty to skip)" : ""}${hint}\n> `,
    );

    const isEmpty = raw.trim() === "";

    if (sub.type === "string" && Array.isArray(sub.enum)) {
      const choices = (sub.enum as unknown[]).filter((x): x is string => typeof x === "string");
      if (isEmpty && optional) continue;
      if (isEmpty && !optional) throw new Error(`Pick one of: ${choices.join(", ")}`);
      const pick = raw.trim();
      if (!choices.includes(pick)) throw new Error(`Pick one of: ${choices.join(", ")}`);
      record[propKey] = pick;
      continue;
    }

    if (sub.type === "array" && isPlainObject(sub.items) && Array.isArray(sub.items.enum)) {
      const choices = (sub.items.enum as unknown[]).filter(
        (x): x is string => typeof x === "string",
      );
      const maxItems = typeof sub.maxItems === "number" ? sub.maxItems : 1;
      if (isEmpty && optional) continue;
      if (isEmpty && !optional && maxItems <= 1)
        throw new Error(`Pick one of: ${choices.join(", ")}`);
      if (maxItems <= 1) {
        const pick = raw.trim();
        if (!choices.includes(pick)) throw new Error(`Pick one of: ${choices.join(", ")}`);
        record[propKey] = pick;
      } else {
        const parts = raw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        for (const p of parts) {
          if (!choices.includes(p))
            throw new Error(`Invalid choice "${p}". Options: ${choices.join(", ")}`);
        }
        record[propKey] = parts;
      }
      continue;
    }

    if (sub.type === "boolean") {
      if (isEmpty && optional) continue;
      const b = parseBool(raw);
      if (b === undefined) throw new Error(`Expected y/n (got: ${raw.trim() || "(empty)"})`);
      record[propKey] = b;
      continue;
    }

    if (sub.type === "integer") {
      if (isEmpty && optional) continue;
      const n = Number.parseInt(raw.trim(), 10);
      if (Number.isNaN(n)) throw new Error(`Expected integer (got: ${raw.trim()})`);
      record[propKey] = n;
      continue;
    }

    if (sub.type === "number") {
      if (isEmpty && optional) continue;
      const n = Number.parseFloat(raw.trim());
      if (Number.isNaN(n)) throw new Error(`Expected number (got: ${raw.trim()})`);
      record[propKey] = n;
      continue;
    }

    if (sub.type === "string") {
      const trimmed = raw.trim();
      if (trimmed === "" && optional) continue;
      record[propKey] = trimmed;
      continue;
    }

    throw new Error(
      `Unsupported bind_policy property schema for "${propKey}" (type: ${String(sub.type)})`,
    );
  }

  return validateVellumBindPayloadForPort(bindPolicy, record);
}
