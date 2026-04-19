import { expect, test } from "bun:test";
import { buildAgents } from "./agents/buildAgents.ts";
import { createDemoStack } from "./obp/demoPersistence.ts";
import { runCollaborative } from "./scenarios/collaborative.ts";

test("collaborative scenario ends with one BINDS edge", async () => {
  const agents = await buildAgents();
  const stack = createDemoStack();
  await runCollaborative(agents, stack);
  const binds = stack.persistence.listBinds();
  expect(binds.length).toBe(1);
});
