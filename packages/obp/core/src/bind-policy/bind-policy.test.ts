import { expect, test } from "bun:test";
import type { Port } from "../model/types.ts";
import { counterpartyBindSchemaForProperties, portBindPolicySchema } from "./standard-schema.ts";
import type { PortBindPolicy } from "./types.ts";
import { validateCounterpartyBindForPort } from "./validate.ts";

const textPolicy: PortBindPolicy = {
  version: "1",
  properties: [
    {
      type: "text",
      name: "Greeting",
      prompt: "A short hello",
      constraints: { minLength: 1 },
    },
  ],
};

function expectSync<T>(r: unknown): { issues?: ReadonlyArray<{ message: string }>; value?: T } {
  if (r instanceof Promise) {
    throw new TypeError("expected synchronous validate result");
  }
  return r as { issues?: ReadonlyArray<{ message: string }>; value?: T };
}

test("counterpartyBindSchemaForProperties enforces text minLength", () => {
  const s = counterpartyBindSchemaForProperties(textPolicy.properties);
  const ok = expectSync(s["~standard"].validate({ greeting: "hi" }));
  expect(ok.issues).toBeUndefined();
  expect(ok.value).toEqual({ greeting: "hi" });
  const bad = expectSync(s["~standard"].validate({ greeting: "" }));
  expect(bad.issues).toBeDefined();
});

test("counterpartyBindSchemaForProperties choice single vs multi maxSelections", () => {
  const single = counterpartyBindSchemaForProperties([
    {
      type: "choice",
      name: "Pick",
      prompt: "One",
      constraints: { choices: ["a", "b"], maxSelections: 1 },
    },
  ]);
  expect(expectSync(single["~standard"].validate({ pick: "a" })).value).toEqual({ pick: "a" });

  const multi = counterpartyBindSchemaForProperties([
    {
      type: "choice",
      name: "Pick",
      prompt: "Many",
      constraints: { choices: ["a", "b", "c"], maxSelections: 2 },
    },
  ]);
  expect(expectSync(multi["~standard"].validate({ pick: ["a", "b"] })).value).toEqual({
    pick: ["a", "b"],
  });
  expect(expectSync(multi["~standard"].validate({ pick: [] })).issues).toBeDefined();
  expect(expectSync(multi["~standard"].validate({ pick: ["a", "b", "c"] })).issues).toBeDefined();
});

test("counterpartyBindSchemaForProperties rejects unknown keys", () => {
  const s = counterpartyBindSchemaForProperties(textPolicy.properties);
  expect(expectSync(s["~standard"].validate({ greeting: "hi", extra: 1 })).issues).toBeDefined();
});

test("counterpartyBindSchemaForProperties allows missing optional fields", () => {
  const s = counterpartyBindSchemaForProperties([
    { type: "boolean", name: "Agree", prompt: "Accept terms", optional: true },
  ]);
  expect(expectSync(s["~standard"].validate({})).value).toEqual({});
});

test("portBindPolicySchema rejects choice with maxSelections > choices.length", () => {
  const r = expectSync(
    portBindPolicySchema["~standard"].validate({
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
  );
  expect(r.issues).toBeDefined();
});

test("portBindPolicySchema accepts a valid policy", () => {
  const r = expectSync(portBindPolicySchema["~standard"].validate(textPolicy));
  expect(r.issues).toBeUndefined();
  expect(r.value).toEqual(textPolicy);
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
