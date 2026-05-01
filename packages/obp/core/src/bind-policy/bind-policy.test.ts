import { expect, test } from "bun:test";
import type { Port } from "../model/types.ts";
import { bindPolicyPropertiesToZod } from "./compile.ts";
import { validateCounterpartyBindForPort } from "./validate.ts";

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

test("bindPolicyPropertiesToZod compiles text with describe on metadata", () => {
  const z = bindPolicyPropertiesToZod(textPolicy.properties);
  const r = z.parse({ greeting: "hi" });
  expect(r).toEqual({ greeting: "hi" });
  expect(() => z.parse({ greeting: "" })).toThrow();
});

test("choice single vs multi maxSelections", () => {
  const single = bindPolicyPropertiesToZod([
    {
      type: "choice",
      name: "Pick",
      prompt: "One",
      constraints: { choices: ["a", "b"], maxSelections: 1 },
    },
  ]);
  expect(single.parse({ pick: "a" })).toEqual({ pick: "a" });

  const multi = bindPolicyPropertiesToZod([
    {
      type: "choice",
      name: "Pick",
      prompt: "Many",
      constraints: { choices: ["a", "b", "c"], maxSelections: 2 },
    },
  ]);
  expect(multi.parse({ pick: ["a", "b"] })).toEqual({ pick: ["a", "b"] });
  expect(() => multi.parse({ pick: [] })).toThrow();
});

test("validateCounterpartyBindForPort rejects payload without policy", () => {
  const port = { bind_policy: undefined } as unknown as Port;
  expect(validateCounterpartyBindForPort(port, {})).toEqual({});
  expect(() => validateCounterpartyBindForPort(port, { x: 1 })).toThrow();
});

test("validateCounterpartyBindForPort validates against port.bind_policy", () => {
  const port = {
    bind_policy: textPolicy,
  } as unknown as Port;
  expect(validateCounterpartyBindForPort(port, { greeting: "yo" })).toEqual({ greeting: "yo" });
  expect(() => validateCounterpartyBindForPort(port, {})).toThrow();
});
