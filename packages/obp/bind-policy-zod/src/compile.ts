import {
  type BindPolicyField,
  bindPolicySlugKeys,
  counterpartyBindSchemaForProperties,
  type PortBindPolicy,
  portBindPolicySchema,
} from "@cfd/obp-core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import z from "zod";

const zBindPolicyTextField = z
  .object({
    type: z.literal("text"),
    name: z.string().min(1),
    prompt: z.string(),
    optional: z.boolean().optional(),
    constraints: z
      .object({
        minLength: z.number().int().optional(),
        maxLength: z.number().int().optional(),
      })
      .optional(),
  })
  .strict();

const zBindPolicyBooleanField = z
  .object({
    type: z.literal("boolean"),
    name: z.string().min(1),
    prompt: z.string(),
    optional: z.boolean().optional(),
  })
  .strict();

const zBindPolicyIntField = z
  .object({
    type: z.literal("int"),
    name: z.string().min(1),
    prompt: z.string(),
    optional: z.boolean().optional(),
    constraints: z
      .object({
        min: z.number().int().optional(),
        max: z.number().int().optional(),
      })
      .optional(),
  })
  .strict();

const zBindPolicyFloatField = z
  .object({
    type: z.literal("float"),
    name: z.string().min(1),
    prompt: z.string(),
    optional: z.boolean().optional(),
    constraints: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .optional(),
  })
  .strict();

const zBindPolicyChoiceField = z
  .object({
    type: z.literal("choice"),
    name: z.string().min(1),
    prompt: z.string(),
    optional: z.boolean().optional(),
    constraints: z.object({
      choices: z.array(z.string()).min(1),
      maxSelections: z.number().int().positive().optional(),
    }),
  })
  .strict();

const zBindPolicyField = z.union([
  zBindPolicyTextField,
  zBindPolicyBooleanField,
  zBindPolicyIntField,
  zBindPolicyFloatField,
  zBindPolicyChoiceField,
]) as z.ZodType<BindPolicyField>;

function pathToZodPath(
  p: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment> | undefined,
): (string | number)[] {
  if (p === undefined) return [];
  const out: (string | number)[] = [];
  for (const seg of p) {
    const k = typeof seg === "object" ? seg.key : seg;
    if (typeof k === "string" || typeof k === "number") {
      out.push(k);
    }
  }
  return out;
}

function bridgeStandardSchemaIssues(
  result: StandardSchemaV1.Result<unknown> | Promise<StandardSchemaV1.Result<unknown>>,
  ctx: z.RefinementCtx,
): void {
  if (result instanceof Promise) {
    throw new TypeError("bind-policy validators must be synchronous");
  }
  if (!result.issues) return;
  for (const issue of result.issues) {
    ctx.addIssue({
      code: "custom",
      message: issue.message,
      path: pathToZodPath(issue.path),
    });
  }
}

/**
 * Zod schema for the wire/JSON shape of {@link PortBindPolicy}.
 * Structural Zod composition for JSON Schema fidelity; final pass/fail delegates to
 * {@link portBindPolicySchema} so rules cannot drift from `@cfd/obp-core`.
 */
export const zPortBindPolicy: z.ZodType<PortBindPolicy> = z
  .object({
    version: z.literal("1"),
    properties: z.array(zBindPolicyField),
  })
  .strict()
  .superRefine((val, ctx) => {
    bridgeStandardSchemaIssues(portBindPolicySchema["~standard"].validate(val), ctx);
  }) as z.ZodType<PortBindPolicy>;

function leafForField(field: BindPolicyField): z.ZodTypeAny {
  switch (field.type) {
    case "text": {
      let s = z.string();
      const c = field.constraints;
      if (c?.minLength !== undefined) {
        s = s.min(c.minLength);
      }
      if (c?.maxLength !== undefined) {
        s = s.max(c.maxLength);
      }
      const d = s.describe(field.prompt);
      return field.optional ? d.optional() : d;
    }
    case "boolean": {
      const s = z.boolean().describe(field.prompt);
      return field.optional ? s.optional() : s;
    }
    case "int": {
      let n = z.number().int();
      const c = field.constraints;
      if (c?.min !== undefined) {
        n = n.min(c.min);
      }
      if (c?.max !== undefined) {
        n = n.max(c.max);
      }
      const d = n.describe(field.prompt);
      return field.optional ? d.optional() : d;
    }
    case "float": {
      let n = z.number();
      const c = field.constraints;
      if (c?.min !== undefined) {
        n = n.min(c.min);
      }
      if (c?.max !== undefined) {
        n = n.max(c.max);
      }
      const d = n.describe(field.prompt);
      return field.optional ? d.optional() : d;
    }
    case "choice": {
      const choices = field.constraints.choices as [string, ...string[]];
      const maxSel = field.constraints.maxSelections ?? 1;
      const en = z.enum(choices).describe(field.prompt);
      if (maxSel <= 1) {
        return field.optional ? en.optional() : en;
      }
      const arr = z.array(en).min(1).max(maxSel).describe(field.prompt);
      return field.optional ? arr.optional() : arr;
    }
    default: {
      const _x: never = field;
      return _x;
    }
  }
}

/**
 * Compiles bind policy properties into a strict Zod object whose keys are slugs of `name`.
 * Each leaf carries `.describe(field.prompt)` so structured-output JSON Schemas surface the
 * per-field guidance to LLMs. Final pass/fail delegates to
 * {@link counterpartyBindSchemaForProperties} via `superRefine` to avoid drift from core.
 */
export function bindPolicyPropertiesToZod(
  properties: readonly BindPolicyField[],
): z.ZodType<Record<string, unknown>> {
  const keys = bindPolicySlugKeys(properties);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (let i = 0; i < properties.length; i++) {
    const field = properties[i];
    const key = keys[i];
    if (field === undefined || key === undefined) {
      continue;
    }
    shape[key] = leafForField(field);
  }
  const ssSchema = counterpartyBindSchemaForProperties(properties);
  return z
    .object(shape)
    .strict()
    .superRefine((val, ctx) => {
      bridgeStandardSchemaIssues(ssSchema["~standard"].validate(val), ctx);
    }) as unknown as z.ZodType<Record<string, unknown>>;
}
