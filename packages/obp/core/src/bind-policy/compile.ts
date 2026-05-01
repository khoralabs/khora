import z from "zod";
import { bindPolicySlugKeys } from "./slug.ts";
import type {
  BindPolicyBooleanField,
  BindPolicyChoiceField,
  BindPolicyField,
  BindPolicyFloatField,
  BindPolicyIntField,
  BindPolicyTextField,
  PortBindPolicy,
} from "./types.ts";

const zBindPolicyTextField: z.ZodType<BindPolicyTextField> = z
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

const zBindPolicyBooleanField: z.ZodType<BindPolicyBooleanField> = z
  .object({
    type: z.literal("boolean"),
    name: z.string().min(1),
    prompt: z.string(),
    optional: z.boolean().optional(),
  })
  .strict();

const zBindPolicyIntField: z.ZodType<BindPolicyIntField> = z
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

const zBindPolicyFloatField: z.ZodType<BindPolicyFloatField> = z
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

const zBindPolicyChoiceField: z.ZodType<BindPolicyChoiceField> = z
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
  .strict()
  .superRefine((val, ctx) => {
    const maxS = val.constraints.maxSelections ?? 1;
    if (maxS > val.constraints.choices.length) {
      ctx.addIssue({
        code: "custom",
        message: "choice.constraints.maxSelections must be <= choices.length",
      });
    }
  });

const zBindPolicyField = z.union([
  zBindPolicyTextField,
  zBindPolicyBooleanField,
  zBindPolicyIntField,
  zBindPolicyFloatField,
  zBindPolicyChoiceField,
]) as z.ZodType<BindPolicyField>;

/** Validates persisted / wire JSON for {@link PortBindPolicy}. */
export const zPortBindPolicy: z.ZodType<PortBindPolicy> = z
  .object({
    version: z.literal("1"),
    properties: z.array(zBindPolicyField),
  })
  .strict();

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
      s = s.describe(field.prompt);
      return field.optional ? s.optional() : s;
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
      n = n.describe(field.prompt);
      return field.optional ? n.optional() : n;
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
      n = n.describe(field.prompt);
      return field.optional ? n.optional() : n;
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
 * Compiles bind policy properties to a strict Zod object whose keys are slugs of `name`.
 * Use for validating `counterparty_bind` payloads at bind time.
 */
export function bindPolicyPropertiesToZod(
  properties: readonly BindPolicyField[],
): z.ZodObject<Record<string, z.ZodTypeAny>> {
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
  return z.object(shape).strict();
}
