import { describe, expect, test } from "bun:test";
import { validateBindPayloadForPort } from "./nbc-bind-policy-validate.ts";

const textPolicy = {
  version: "1" as const,
  properties: [
    {
      type: "text" as const,
      name: "Greeting",
      prompt: "A short hello",
      constraints: { minLength: 1 },
    },
  ],
};

describe("validateBindPayloadForPort", () => {
  test("rejects payload without policy", () => {
    expect(validateBindPayloadForPort(null, {})).toEqual({});
    expect(() => validateBindPayloadForPort(null, { x: 1 })).toThrow();
  });

  test("validates against bind_policy", () => {
    expect(validateBindPayloadForPort(textPolicy, { greeting: "yo" })).toEqual({ greeting: "yo" });
    expect(() => validateBindPayloadForPort(textPolicy, {})).toThrow();
  });
});
