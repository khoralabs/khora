import { ObpError } from "@khoralabs/obp-errors";
import type { ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";

import { stableStringify } from "./stable-stringify";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const compileCache = new Map<string, ValidateFunction>();

/** Prevent unbounded growth when many distinct policies appear in one process. */
const MAX_COMPILE_CACHE = 512;

export function assertBindPolicyJsonSchema(
  bindPolicy: unknown,
): asserts bindPolicy is Record<string, unknown> {
  if (bindPolicy === null || typeof bindPolicy !== "object" || Array.isArray(bindPolicy)) {
    throw new ObpError(
      "VALIDATION",
      "bind_policy must be a JSON object (JSON Schema draft 2020-12)",
    );
  }
}

export function guardBindPayloadRootSchema(schema: Record<string, unknown>): void {
  if (schema.type !== "object") {
    throw new ObpError(
      "VALIDATION",
      'bind_policy JSON Schema root must set "type": "object" (bind_payload is always an object)',
    );
  }
}

/** Compile (cached) validator for **`bind_payload`** given the root JSON Schema. */
export function getBindPayloadValidator(schema: Record<string, unknown>): ValidateFunction {
  guardBindPayloadRootSchema(schema);
  const key = stableStringify(schema);
  const hit = compileCache.get(key);
  if (hit !== undefined) {
    return hit;
  }
  let fn: ValidateFunction;
  try {
    fn = ajv.compile(schema);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ObpError("VALIDATION", `Invalid bind_policy JSON Schema (cannot compile): ${msg}`);
  }
  if (compileCache.size >= MAX_COMPILE_CACHE) {
    const first = compileCache.keys().next().value;
    if (first !== undefined) {
      compileCache.delete(first);
    }
  }
  compileCache.set(key, fn);
  return fn;
}
