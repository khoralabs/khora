import type { StandardSchemaV1 } from "./standard-schema.js";

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (part) =>
    part.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * SHA-256 of canonical JSON for a plain object tree (no functions, no class instances).
 * Keys are sorted recursively for determinism.
 */
export async function hashPlainObject(obj: unknown): Promise<string> {
  return sha256Hex(canonicalStringify(obj));
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, sortValue(v)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

type SchemaWithJson = StandardSchemaV1 & {
  toJSONSchema?: () => unknown;
};

/**
 * Stable representation of a Standard Schema for hashing (JSON Schema when available).
 */
export function schemaToHashInput(schema: StandardSchemaV1): unknown {
  const s = schema as SchemaWithJson;
  if (typeof s.toJSONSchema === "function") {
    return s.toJSONSchema();
  }
  const std = s["~standard"];
  return {
    vendor: std.vendor,
    version: std.version,
  };
}
