import { expect, test } from "bun:test";
import type { PortBindPolicy } from "@khoralabs/obp-core";
import z from "zod";
import { bindPolicyPropertiesToZod, zPortBindPolicy } from "./compile.ts";

const textPolicy: PortBindPolicy = {
  version: "1",
  properties: [
    {
      type: "text",
      name: "Greeting",
      prompt: "A short hello",
      constraints: { minLength: 1 },
    },
    {
      type: "choice",
      name: "Tone",
      prompt: "Pick one tone",
      constraints: { choices: ["warm", "neutral", "formal"] },
    },
  ],
};

test("bindPolicyPropertiesToZod accepts valid payload and rejects invalid", () => {
  const s = bindPolicyPropertiesToZod(textPolicy.properties);
  expect(s.parse({ greeting: "hi", tone: "warm" })).toEqual({ greeting: "hi", tone: "warm" });
  expect(() => s.parse({ greeting: "", tone: "warm" })).toThrow();
  expect(() => s.parse({ greeting: "hi", tone: "loud" })).toThrow();
});

test("bindPolicyPropertiesToZod JSON Schema preserves per-field prompts as descriptions", () => {
  const s = bindPolicyPropertiesToZod(textPolicy.properties);
  const json = z.toJSONSchema(s, { unrepresentable: "any" }) as Record<string, unknown>;
  const props = json.properties as Record<string, { description?: string }>;
  expect(props.greeting?.description).toBe("A short hello");
  expect(props.tone?.description).toBe("Pick one tone");
});

test("zPortBindPolicy validates a well-formed policy and rejects bad maxSelections", () => {
  expect(zPortBindPolicy.parse(textPolicy)).toEqual(textPolicy);
  expect(() =>
    zPortBindPolicy.parse({
      version: "1",
      properties: [
        {
          type: "choice",
          name: "Pick",
          prompt: "P",
          constraints: { choices: ["a"], maxSelections: 2 },
        },
      ],
    }),
  ).toThrow();
});

test("bindPolicyPropertiesToZod choice multi-select preserves enum and array shape in JSON Schema", () => {
  const s = bindPolicyPropertiesToZod([
    {
      type: "choice",
      name: "Pick",
      prompt: "Pick up to 2",
      constraints: { choices: ["a", "b", "c"], maxSelections: 2 },
    },
  ]);
  expect(s.parse({ pick: ["a", "b"] })).toEqual({ pick: ["a", "b"] });
  expect(() => s.parse({ pick: ["a", "b", "c"] })).toThrow();
  const json = z.toJSONSchema(s, { unrepresentable: "any" }) as Record<string, unknown>;
  const props = json.properties as Record<string, { description?: string }>;
  expect(props.pick?.description).toBe("Pick up to 2");
});
