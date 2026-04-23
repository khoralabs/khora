import { hashPlainObject } from "./hash.js";

/**
 * Pre-hash tree for a host-supplied per-invocation slice (user, subject, policy bundle, etc.).
 * Paired with {@link computeInvocationContextHash}; not included in `staticHash` or `runtimeHash`.
 */
export type InvocationContextCanonicalPayload = {
  kind: "invocation";
  /**
   * Normalized, JSON-serializable record (plain objects only, sorted keys at every level; no functions).
   * Built by {@link normalizeInvocationContextForHash}.
   */
  context: Record<string, unknown>;
};

export type NormalizeInvocationContextForHashOptions = {
  /**
   * If set, only these top-level keys are included (after the input is coerced to a plain object).
   * Key order in the normalized output is still sorted for determinism.
   */
  allowlist?: string[];
};

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value);
  if (proto === null) {
    return true;
  }
  return proto === Object.prototype;
}

function isInvocationRootRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value) || typeof value !== "object") {
    return false;
  }
  return isPlainObject(value);
}

/**
 * Recursively normalize to a JSON-only tree: no `undefined` values (keys omitted);
 * `Date` → ISO string; arrays recurse; only plain objects allowed for nested objects.
 * Throws for functions, `BigInt`, symbols, or circular references.
 */
function normalizeValue(value: unknown, path: string, visitStack: WeakSet<object>): unknown {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return value;
  }
  if (t === "bigint" || t === "symbol" || t === "function") {
    throw new Error(
      `invocationContext not JSON-serializable at ${path} (${t}) — use strings or numbers`,
    );
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value
      .map((v, i) => normalizeValue(v, `${path}[${i}]`, visitStack))
      .filter((v) => v !== undefined);
  }
  if (typeof value === "object") {
    if (!isPlainObject(value as object)) {
      throw new Error(
        `invocationContext expects a plain object at ${path} — use JSON-serializable data only`,
      );
    }
    if (visitStack.has(value as object)) {
      throw new Error(`invocationContext is circular at ${path}`);
    }
    visitStack.add(value as object);
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort((a, b) => a.localeCompare(b))) {
      const v = normalizeValue(o[k], path ? `${path}.${k}` : k, visitStack);
      if (v !== undefined) {
        out[k] = v;
      }
    }
    visitStack.delete(value as object);
    return out;
  }
  return value;
}

/**
 * Returns a stable plain object to hash, or `undefined` when the input is empty/omitted
 * (after normalization) so callers can skip `invocationHash`.
 */
export function normalizeInvocationContextForHash(
  input: unknown,
  options?: NormalizeInvocationContextForHashOptions,
): Record<string, unknown> | undefined {
  if (!isInvocationRootRecord(input)) {
    return undefined;
  }
  const record = input;
  const visit = new WeakSet<object>();
  let topKeys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  if (options?.allowlist?.length) {
    const set = new Set(options.allowlist);
    topKeys = topKeys.filter((k) => set.has(k));
  }
  if (topKeys.length === 0) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const k of topKeys) {
    const v = normalizeValue(record[k], k, visit);
    if (v !== undefined) {
      out[k] = v;
    }
  }
  if (Object.keys(out).length === 0) {
    return undefined;
  }
  return out;
}

/**
 * Wraps a normalized context record in the pre-hash structure used with {@link hashPlainObject}.
 */
export function invocationContextCanonicalPayload(
  context: Record<string, unknown>,
): InvocationContextCanonicalPayload {
  return { kind: "invocation", context };
}

/**
 * SHA-256 of the canonical invocation payload, or `undefined` when the input is empty/omitted
 * after {@link normalizeInvocationContextForHash}.
 */
export async function computeInvocationContextHash(
  input: unknown,
  options?: NormalizeInvocationContextForHashOptions,
): Promise<string | undefined> {
  const n = normalizeInvocationContextForHash(input, options);
  if (n === undefined) {
    return undefined;
  }
  return hashPlainObject(invocationContextCanonicalPayload(n));
}
