import { expect, test } from "bun:test";
import type { ObpClient, ObpPersistence } from "@cfd/obp-core";
import { runRfpAwardCore } from "./protocols/rfp.ts";
import { runThreeWayTcpCore } from "./protocols/tcp.ts";
import { runTwoPhaseCommitCore, type TwoPcOutcome } from "./protocols/two-pc.ts";
import { createDemoStack } from "./stack.ts";

function countBindsToTerminalPorts(client: ObpClient, persistence: ObpPersistence): number {
  let n = 0;
  for (const b of persistence.listBinds()) {
    const pr = client.getPort(b.portId);
    if (pr.kind === "found" && pr.port.terminal) {
      n += 1;
    }
  }
  return n;
}

function countBindsForPort(persistence: ObpPersistence, portId: string): number {
  let n = 0;
  for (const b of persistence.listBinds()) {
    if (b.portId === portId) {
      n += 1;
    }
  }
  return n;
}

test("three-way TCP: two binds, one terminal", () => {
  const stack = createDemoStack();
  runThreeWayTcpCore(stack.client);
  const binds = stack.persistence.listBinds();
  expect(binds.length).toBe(2);
  expect(countBindsToTerminalPorts(stack.client, stack.persistence)).toBe(1);
});

test("2PC commit: prepare binds + one terminal commit", () => {
  const stack = createDemoStack();
  runTwoPhaseCommitCore(stack.client, "commit" satisfies TwoPcOutcome);
  expect(stack.persistence.listBinds().length).toBe(3);
  expect(countBindsToTerminalPorts(stack.client, stack.persistence)).toBe(1);
});

test("2PC abort: terminal bind on abort only", () => {
  const stack = createDemoStack();
  runTwoPhaseCommitCore(stack.client, "abort" satisfies TwoPcOutcome);
  expect(stack.persistence.listBinds().length).toBe(3);
  expect(countBindsToTerminalPorts(stack.client, stack.persistence)).toBe(1);
});

test("RFP: single award bind; losing seller port unbound", () => {
  const stack = createDemoStack();
  const { loserPortId } = runRfpAwardCore(stack.client);
  expect(stack.persistence.listBinds().length).toBe(1);
  expect(countBindsForPort(stack.persistence, loserPortId)).toBe(0);
});
