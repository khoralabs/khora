import type { StandardSchemaV1 } from "@standard-schema/spec";
import { bindPolicySlugKeys } from "./nbc-bind-policy-slug.ts";
import type {
  BindPolicyChoiceField,
  BindPolicyField,
  BindPolicyFloatField,
  BindPolicyIntField,
  BindPolicyTextField,
  PortBindPolicy,
} from "./nbc-bind-policy-types.ts";

const VENDOR = "@khoralabs/obp-v2-nbc";

type Issue = StandardSchemaV1.Issue;
type Path = ReadonlyArray<PropertyKey>;

function issue(message: string, path?: Path): Issue {
  return path === undefined ? { message } : { message, path };
}

function ok<T>(value: T): { issues: undefined; value: T } {
  return { issues: undefined, value };
}

function fail<T>(issues: Issue[]): StandardSchemaV1.Result<T> {
  return { issues } as StandardSchemaV1.FailureResult;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInteger(v: number): boolean {
  return Number.isFinite(v) && Math.floor(v) === v;
}

function joinPath(base: Path, ...rest: PropertyKey[]): Path {
  return rest.length === 0 ? base : [...base, ...rest];
}

const KNOWN_FIELD_TYPES = new Set(["text", "boolean", "int", "float", "choice"]);

const TEXT_KEYS = new Set(["type", "name", "prompt", "optional", "constraints"]);
const TEXT_CONSTRAINT_KEYS = new Set(["minLength", "maxLength"]);
const BOOLEAN_KEYS = new Set(["type", "name", "prompt", "optional"]);
const INT_KEYS = new Set(["type", "name", "prompt", "optional", "constraints"]);
const INT_CONSTRAINT_KEYS = new Set(["min", "max"]);
const FLOAT_KEYS = new Set(["type", "name", "prompt", "optional", "constraints"]);
const FLOAT_CONSTRAINT_KEYS = new Set(["min", "max"]);
const CHOICE_KEYS = new Set(["type", "name", "prompt", "optional", "constraints"]);
const CHOICE_CONSTRAINT_KEYS = new Set(["choices", "maxSelections", "minSelections"]);
const POLICY_KEYS = new Set(["version", "properties"]);

function validateUnknownKeys(
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: Path,
  out: Issue[],
): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) {
      out.push(issue(`Unrecognized key: '${k}'`, joinPath(path, k)));
    }
  }
}

function validateCommonFieldHeaders(
  v: Record<string, unknown>,
  path: Path,
  out: Issue[],
): { name?: string; prompt?: string; optional?: boolean } {
  const result: { name?: string; prompt?: string; optional?: boolean } = {};
  if (typeof v.name !== "string" || v.name.length < 1) {
    out.push(issue("Expected non-empty string", joinPath(path, "name")));
  } else {
    result.name = v.name;
  }
  if (typeof v.prompt !== "string") {
    out.push(issue("Expected string", joinPath(path, "prompt")));
  } else {
    result.prompt = v.prompt;
  }
  if (v.optional !== undefined && typeof v.optional !== "boolean") {
    out.push(issue("Expected boolean", joinPath(path, "optional")));
  } else if (typeof v.optional === "boolean") {
    result.optional = v.optional;
  }
  return result;
}

function validateTextField(v: Record<string, unknown>, path: Path, out: Issue[]): void {
  validateUnknownKeys(v, TEXT_KEYS, path, out);
  validateCommonFieldHeaders(v, path, out);
  if (v.constraints !== undefined) {
    if (!isPlainObject(v.constraints)) {
      out.push(issue("Expected object", joinPath(path, "constraints")));
    } else {
      const c = v.constraints;
      const cPath = joinPath(path, "constraints");
      validateUnknownKeys(c, TEXT_CONSTRAINT_KEYS, cPath, out);
      if (c.minLength !== undefined) {
        if (typeof c.minLength !== "number" || !isInteger(c.minLength)) {
          out.push(issue("Expected integer", joinPath(cPath, "minLength")));
        }
      }
      if (c.maxLength !== undefined) {
        if (typeof c.maxLength !== "number" || !isInteger(c.maxLength)) {
          out.push(issue("Expected integer", joinPath(cPath, "maxLength")));
        }
      }
    }
  }
}

function validateBooleanField(v: Record<string, unknown>, path: Path, out: Issue[]): void {
  validateUnknownKeys(v, BOOLEAN_KEYS, path, out);
  validateCommonFieldHeaders(v, path, out);
}

function validateIntField(v: Record<string, unknown>, path: Path, out: Issue[]): void {
  validateUnknownKeys(v, INT_KEYS, path, out);
  validateCommonFieldHeaders(v, path, out);
  if (v.constraints !== undefined) {
    if (!isPlainObject(v.constraints)) {
      out.push(issue("Expected object", joinPath(path, "constraints")));
    } else {
      const c = v.constraints;
      const cPath = joinPath(path, "constraints");
      validateUnknownKeys(c, INT_CONSTRAINT_KEYS, cPath, out);
      if (c.min !== undefined) {
        if (typeof c.min !== "number" || !isInteger(c.min)) {
          out.push(issue("Expected integer", joinPath(cPath, "min")));
        }
      }
      if (c.max !== undefined) {
        if (typeof c.max !== "number" || !isInteger(c.max)) {
          out.push(issue("Expected integer", joinPath(cPath, "max")));
        }
      }
    }
  }
}

function validateFloatField(v: Record<string, unknown>, path: Path, out: Issue[]): void {
  validateUnknownKeys(v, FLOAT_KEYS, path, out);
  validateCommonFieldHeaders(v, path, out);
  if (v.constraints !== undefined) {
    if (!isPlainObject(v.constraints)) {
      out.push(issue("Expected object", joinPath(path, "constraints")));
    } else {
      const c = v.constraints;
      const cPath = joinPath(path, "constraints");
      validateUnknownKeys(c, FLOAT_CONSTRAINT_KEYS, cPath, out);
      if (c.min !== undefined && typeof c.min !== "number") {
        out.push(issue("Expected number", joinPath(cPath, "min")));
      }
      if (c.max !== undefined && typeof c.max !== "number") {
        out.push(issue("Expected number", joinPath(cPath, "max")));
      }
    }
  }
}

function validateChoiceField(v: Record<string, unknown>, path: Path, out: Issue[]): void {
  validateUnknownKeys(v, CHOICE_KEYS, path, out);
  validateCommonFieldHeaders(v, path, out);
  if (!isPlainObject(v.constraints)) {
    out.push(issue("Expected object", joinPath(path, "constraints")));
    return;
  }
  const c = v.constraints;
  const cPath = joinPath(path, "constraints");
  validateUnknownKeys(c, CHOICE_CONSTRAINT_KEYS, cPath, out);

  if (!Array.isArray(c.choices)) {
    out.push(issue("Expected non-empty string array", joinPath(cPath, "choices")));
  } else if (c.choices.length < 1) {
    out.push(issue("Expected non-empty array", joinPath(cPath, "choices")));
  } else {
    for (let i = 0; i < c.choices.length; i++) {
      if (typeof c.choices[i] !== "string") {
        out.push(issue("Expected string", joinPath(cPath, "choices", i)));
      }
    }
  }

  let maxSel: number | undefined;
  if (c.maxSelections !== undefined) {
    if (
      typeof c.maxSelections !== "number" ||
      !isInteger(c.maxSelections) ||
      c.maxSelections <= 0
    ) {
      out.push(issue("Expected positive integer", joinPath(cPath, "maxSelections")));
    } else {
      maxSel = c.maxSelections;
    }
  }

  let minSel: number | undefined;
  if (c.minSelections !== undefined) {
    if (
      typeof c.minSelections !== "number" ||
      !isInteger(c.minSelections) ||
      c.minSelections <= 0
    ) {
      out.push(issue("Expected positive integer", joinPath(cPath, "minSelections")));
    } else {
      minSel = c.minSelections;
    }
  }

  const implicitMax = maxSel ?? 1;
  if (minSel !== undefined && minSel > implicitMax) {
    out.push(
      issue(
        "choice.constraints.minSelections must be <= maxSelections (default 1 if omitted)",
        path,
      ),
    );
  }
  if (minSel !== undefined && minSel > 1 && (maxSel === undefined || maxSel <= 1)) {
    out.push(
      issue(
        "choice.constraints.minSelections > 1 requires maxSelections > 1",
        joinPath(cPath, "minSelections"),
      ),
    );
  }

  if (Array.isArray(c.choices) && maxSel !== undefined && maxSel > c.choices.length) {
    out.push(issue("choice.constraints.maxSelections must be <= choices.length", path));
  }
  if (Array.isArray(c.choices) && minSel !== undefined && minSel > c.choices.length) {
    out.push(issue("choice.constraints.minSelections must be <= choices.length", path));
  }
}

function validatePolicyField(v: unknown, path: Path, out: Issue[]): void {
  if (!isPlainObject(v)) {
    out.push(issue("Expected object", path));
    return;
  }
  const t = v.type;
  if (typeof t !== "string" || !KNOWN_FIELD_TYPES.has(t)) {
    out.push(
      issue(
        `Expected 'type' to be one of: text, boolean, int, float, choice`,
        joinPath(path, "type"),
      ),
    );
    return;
  }
  switch (t) {
    case "text":
      validateTextField(v, path, out);
      return;
    case "boolean":
      validateBooleanField(v, path, out);
      return;
    case "int":
      validateIntField(v, path, out);
      return;
    case "float":
      validateFloatField(v, path, out);
      return;
    case "choice":
      validateChoiceField(v, path, out);
      return;
  }
}

function validatePortBindPolicyValue(value: unknown): StandardSchemaV1.Result<PortBindPolicy> {
  const issues: Issue[] = [];
  if (!isPlainObject(value)) {
    return fail([issue("Expected object")]);
  }
  validateUnknownKeys(value, POLICY_KEYS, [], issues);
  if (value.version !== "1") {
    issues.push(issue(`Expected version === '1'`, ["version"]));
  }
  if (!Array.isArray(value.properties)) {
    issues.push(issue("Expected array", ["properties"]));
  } else {
    for (let i = 0; i < value.properties.length; i++) {
      validatePolicyField(value.properties[i], ["properties", i], issues);
    }
  }
  if (issues.length > 0) {
    return fail(issues);
  }
  return ok(value as PortBindPolicy);
}

/**
 * Standard Schema validator for the wire/JSON shape of {@link PortBindPolicy}.
 * Strict on object shapes; rejects unknown keys at every level.
 */
export const portBindPolicySchema: StandardSchemaV1<unknown, PortBindPolicy> = {
  "~standard": {
    version: 1,
    vendor: VENDOR,
    validate: validatePortBindPolicyValue,
    types: {
      input: undefined as unknown,
      output: undefined as unknown as PortBindPolicy,
    },
  },
};

function validateLeafValue(field: BindPolicyField, value: unknown, path: Path, out: Issue[]): void {
  switch (field.type) {
    case "text": {
      validateTextLeaf(field, value, path, out);
      return;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        out.push(issue("Expected boolean", path));
      }
      return;
    }
    case "int": {
      validateIntLeaf(field, value, path, out);
      return;
    }
    case "float": {
      validateFloatLeaf(field, value, path, out);
      return;
    }
    case "choice": {
      validateChoiceLeaf(field, value, path, out);
      return;
    }
  }
}

function validateTextLeaf(
  field: BindPolicyTextField,
  value: unknown,
  path: Path,
  out: Issue[],
): void {
  if (typeof value !== "string") {
    out.push(issue("Expected string", path));
    return;
  }
  const c = field.constraints;
  if (c?.minLength !== undefined && value.length < c.minLength) {
    out.push(issue(`String must contain at least ${c.minLength} character(s)`, path));
  }
  if (c?.maxLength !== undefined && value.length > c.maxLength) {
    out.push(issue(`String must contain at most ${c.maxLength} character(s)`, path));
  }
}

function validateIntLeaf(
  field: BindPolicyIntField,
  value: unknown,
  path: Path,
  out: Issue[],
): void {
  if (typeof value !== "number" || !isInteger(value)) {
    out.push(issue("Expected integer", path));
    return;
  }
  const c = field.constraints;
  if (c?.min !== undefined && value < c.min) {
    out.push(issue(`Number must be greater than or equal to ${c.min}`, path));
  }
  if (c?.max !== undefined && value > c.max) {
    out.push(issue(`Number must be less than or equal to ${c.max}`, path));
  }
}

function validateFloatLeaf(
  field: BindPolicyFloatField,
  value: unknown,
  path: Path,
  out: Issue[],
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    out.push(issue("Expected number", path));
    return;
  }
  const c = field.constraints;
  if (c?.min !== undefined && value < c.min) {
    out.push(issue(`Number must be greater than or equal to ${c.min}`, path));
  }
  if (c?.max !== undefined && value > c.max) {
    out.push(issue(`Number must be less than or equal to ${c.max}`, path));
  }
}

function validateChoiceLeaf(
  field: BindPolicyChoiceField,
  value: unknown,
  path: Path,
  out: Issue[],
): void {
  const choices = field.constraints.choices;
  const maxSel = field.constraints.maxSelections ?? 1;
  const minSel = field.constraints.minSelections ?? 1;
  if (maxSel <= 1) {
    if (typeof value !== "string") {
      out.push(issue("Expected string", path));
      return;
    }
    if (!choices.includes(value)) {
      out.push(issue(`Expected one of: ${choices.join(", ")}`, path));
    }
    return;
  }
  if (!Array.isArray(value)) {
    out.push(issue("Expected array", path));
    return;
  }
  if (value.length < minSel) {
    out.push(issue(`Array must contain at least ${minSel} element(s)`, path));
  }
  if (value.length > maxSel) {
    out.push(issue(`Array must contain at most ${maxSel} element(s)`, path));
  }
  for (let i = 0; i < value.length; i++) {
    const v = value[i];
    if (typeof v !== "string" || !choices.includes(v)) {
      out.push(issue(`Expected one of: ${choices.join(", ")}`, joinPath(path, i)));
    }
  }
}

function validateBindPayloadValue(
  properties: readonly BindPolicyField[],
  value: unknown,
): StandardSchemaV1.Result<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    return fail([issue("Expected object")]);
  }
  const keys = bindPolicySlugKeys(properties);
  const issues: Issue[] = [];
  const allowed = new Set(keys);
  for (const k of Object.keys(value)) {
    if (!allowed.has(k)) {
      issues.push(issue(`Unrecognized key: '${k}'`, [k]));
    }
  }
  for (let i = 0; i < properties.length; i++) {
    const field = properties[i];
    const key = keys[i];
    if (field === undefined || key === undefined) {
      continue;
    }
    const present = Object.hasOwn(value, key);
    if (!present) {
      if (field.optional !== true) {
        issues.push(issue("Required", [key]));
      }
      continue;
    }
    validateLeafValue(field, value[key], [key], issues);
  }
  if (issues.length > 0) {
    return fail(issues);
  }
  return ok(value);
}

/**
 * Standard Schema validator for **`bind_payload`** keyed by slugs derived from
 * `properties[].name` ({@link bindPolicySlugKeys}). Rejects unknown keys; required when
 * `field.optional !== true`. Per-field type and constraint enforcement matches the canonical
 * rules — this is the single source of truth for bind-payload pass/fail.
 */
export function bindPayloadSchemaForProperties(
  properties: readonly BindPolicyField[],
): StandardSchemaV1<unknown, Record<string, unknown>> {
  return {
    "~standard": {
      version: 1,
      vendor: VENDOR,
      validate: (value: unknown) => validateBindPayloadValue(properties, value),
      types: {
        input: undefined as unknown,
        output: undefined as unknown as Record<string, unknown>,
      },
    },
  };
}
