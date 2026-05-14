import { expect, test } from "bun:test";
import { bindPayloadSchemaForProperties, portBindPolicySchema } from "./nbc-bind-policy-schema.ts";
import type { PortBindPolicy } from "./nbc-bind-policy-types.ts";

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

test("bindPayloadSchemaForProperties enforces text minLength", () => {
  const s = bindPayloadSchemaForProperties(textPolicy.properties);
  const ok = expectSync(s["~standard"].validate({ greeting: "hi" }));
  expect(ok.issues).toBeUndefined();
  expect(ok.value).toEqual({ greeting: "hi" });
  const bad = expectSync(s["~standard"].validate({ greeting: "" }));
  expect(bad.issues).toBeDefined();
});

test("bindPayloadSchemaForProperties choice single vs multi maxSelections", () => {
  const single = bindPayloadSchemaForProperties([
    {
      type: "choice",
      name: "Pick",
      prompt: "One",
      constraints: { choices: ["a", "b"], maxSelections: 1 },
    },
  ]);
  expect(expectSync(single["~standard"].validate({ pick: "a" })).value).toEqual({ pick: "a" });

  const multi = bindPayloadSchemaForProperties([
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

test("bindPayloadSchemaForProperties choice minSelections", () => {
  const s = bindPayloadSchemaForProperties([
    {
      type: "choice",
      name: "Pick",
      prompt: "At least two",
      constraints: { choices: ["a", "b", "c"], maxSelections: 3, minSelections: 2 },
    },
  ]);
  expect(expectSync(s["~standard"].validate({ pick: ["a"] })).issues).toBeDefined();
  expect(expectSync(s["~standard"].validate({ pick: ["a", "b"] })).value).toEqual({
    pick: ["a", "b"],
  });
});

test("portBindPolicySchema rejects minSelections > maxSelections", () => {
  const r = expectSync(
    portBindPolicySchema["~standard"].validate({
      version: "1",
      properties: [
        {
          type: "choice",
          name: "Pick",
          prompt: "P",
          constraints: { choices: ["a", "b"], minSelections: 3, maxSelections: 2 },
        },
      ],
    }),
  );
  expect(r.issues).toBeDefined();
});

test("bindPayloadSchemaForProperties rejects unknown keys", () => {
  const s = bindPayloadSchemaForProperties(textPolicy.properties);
  expect(expectSync(s["~standard"].validate({ greeting: "hi", extra: 1 })).issues).toBeDefined();
});

test("bindPayloadSchemaForProperties allows missing optional fields", () => {
  const s = bindPayloadSchemaForProperties([
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
