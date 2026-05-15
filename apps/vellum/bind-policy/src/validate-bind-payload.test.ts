import { describe, expect, test } from "bun:test";
import { validateVellumBindPayloadForPort } from "./validate-bind-payload.ts";

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

describe("validateVellumBindPayloadForPort", () => {
  test("rejects payload without policy", () => {
    expect(validateVellumBindPayloadForPort(null, {})).toEqual({});
    expect(() => validateVellumBindPayloadForPort(null, { x: 1 })).toThrow();
  });

  test("validates against bind_policy", () => {
    expect(validateVellumBindPayloadForPort(textPolicy, { greeting: "yo" })).toEqual({
      greeting: "yo",
    });
    expect(() => validateVellumBindPayloadForPort(textPolicy, {})).toThrow();
  });
});
