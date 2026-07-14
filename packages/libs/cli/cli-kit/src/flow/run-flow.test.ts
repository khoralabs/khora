import { expect, test } from "bun:test";

import { requireFlowString, runFlow } from "./run-flow";
import type { FlowDefinition } from "./types";

const def: FlowDefinition = {
  id: "test-flow",
  fields: [
    { id: "a", prompt: "A? " },
    { id: "b", prompt: "B? ", optional: true },
  ],
};

test("runFlow collects required and optional fields", async () => {
  const readLine = (q: string) => {
    if (q === "A? ") return Promise.resolve("a1");
    return Promise.resolve("");
  };
  const row = await runFlow({ readLine, def });
  expect(row.a).toBe("a1");
  expect(row.b).toBeUndefined();
});

test("runFlow uses partialSeeds for required field", async () => {
  let calls = 0;
  const readLine = () => {
    calls++;
    return Promise.resolve("");
  };
  const row = await runFlow({
    readLine,
    def,
    partialSeeds: { a: "seeded" },
  });
  expect(calls).toBe(1);
  expect(row.a).toBe("seeded");
  expect(row.b).toBeUndefined();
});

test("runFlow re-prompts when required field is empty", async () => {
  const answers = ["", "ok"];
  const readLine = () => Promise.resolve(answers.shift() ?? "");
  const row = await runFlow({
    readLine,
    def: { id: "r", fields: [{ id: "x", prompt: "X? " }] },
  });
  expect(row.x).toBe("ok");
});

test("requireFlowString throws when missing", () => {
  expect(() => requireFlowString({}, "a")).toThrow(/a is required/);
});
