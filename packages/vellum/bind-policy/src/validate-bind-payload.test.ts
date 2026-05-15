import { describe, expect, test } from "bun:test";
import { validateVellumBindPayloadForPort } from "./validate-bind-payload.ts";

const greetingSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["greeting"],
  properties: {
    greeting: {
      type: "string" as const,
      minLength: 1,
      description: "A short hello",
    },
  },
};

describe("validateVellumBindPayloadForPort", () => {
  test("rejects payload without policy", () => {
    expect(validateVellumBindPayloadForPort(null, {})).toEqual({});
    expect(() => validateVellumBindPayloadForPort(null, { x: 1 })).toThrow();
  });

  test("validates against bind_policy JSON Schema", () => {
    expect(validateVellumBindPayloadForPort(greetingSchema, { greeting: "yo" })).toEqual({
      greeting: "yo",
    });
    expect(() => validateVellumBindPayloadForPort(greetingSchema, {})).toThrow();
  });
});
