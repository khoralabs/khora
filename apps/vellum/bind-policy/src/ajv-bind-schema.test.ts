import { describe, expect, test } from "bun:test";
import type { JsonDocument } from "@khoralabs/obp-v2-model";
import { getBindPayloadValidator } from "./ajv-compile-bind-schema.ts";
import { validateVellumBindPayloadForPort } from "./validate-bind-payload.ts";

const textSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["greeting"],
  properties: {
    greeting: { type: "string" as const, minLength: 1 },
  },
};

describe("AJV bind_payload schemas", () => {
  test("enforces string minLength", () => {
    const v = getBindPayloadValidator(textSchema);
    expect(v({ greeting: "hi" })).toBe(true);
    expect(v({ greeting: "" })).toBe(false);
  });

  test("choice single string enum vs multi array", () => {
    const single = {
      type: "object" as const,
      additionalProperties: false,
      required: ["pick"],
      properties: {
        pick: { type: "string" as const, enum: ["a", "b"] },
      },
    };
    expect(getBindPayloadValidator(single)({ pick: "a" })).toBe(true);
    expect(getBindPayloadValidator(single)({ pick: "c" })).toBe(false);

    const multi = {
      type: "object" as const,
      additionalProperties: false,
      required: ["pick"],
      properties: {
        pick: {
          type: "array" as const,
          items: { type: "string" as const, enum: ["a", "b", "c"] },
          minItems: 1,
          maxItems: 2,
        },
      },
    };
    expect(getBindPayloadValidator(multi)({ pick: ["a", "b"] })).toBe(true);
    expect(getBindPayloadValidator(multi)({ pick: [] })).toBe(false);
    expect(getBindPayloadValidator(multi)({ pick: ["a", "b", "c"] })).toBe(false);
  });

  test("multi choice minItems", () => {
    const multi = {
      type: "object" as const,
      additionalProperties: false,
      required: ["pick"],
      properties: {
        pick: {
          type: "array" as const,
          items: { type: "string" as const, enum: ["a", "b", "c"] },
          minItems: 2,
          maxItems: 3,
        },
      },
    };
    expect(getBindPayloadValidator(multi)({ pick: ["a"] })).toBe(false);
    expect(getBindPayloadValidator(multi)({ pick: ["a", "b"] })).toBe(true);
  });

  test("rejects unknown keys via additionalProperties false", () => {
    const v = getBindPayloadValidator(textSchema);
    expect(v({ greeting: "hi", extra: 1 })).toBe(false);
  });

  test("optional boolean omitted", () => {
    const schema = {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        agree: { type: "boolean" as const },
      },
    };
    expect(getBindPayloadValidator(schema)({})).toBe(true);
  });

  test("invalid schema compile throws ObpError via facade", () => {
    expect(() =>
      validateVellumBindPayloadForPort({ type: "object", properties: "bad" } as JsonDocument, {}),
    ).toThrow();
  });
});
