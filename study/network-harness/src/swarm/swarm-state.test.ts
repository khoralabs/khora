import { expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";

import {
  checkTokenBudgetRemainingStep,
  createSwarmState,
  incrementTokensUsedStep,
  listTurnTelemetry,
  recordTurnTelemetryStep,
  resetSwarmStateClientForTests,
} from "./swarm-state.ts";
import type { AgentLoopState, SwarmConfig } from "./types.ts";

const dataDir = path.join(os.tmpdir(), `swarm-state-${process.pid}-${crypto.randomUUID()}`);

const config: SwarmConfig = {
  sessionId: "session-budget",
  dataDir,
  goal: "test",
  agentCount: 2,
  maxTokenBudget: 100,
  contextMessageLimit: 5,
  model: { id: "test", maxSteps: 1 },
  roles: ["a", "b"],
};

const agents: AgentLoopState[] = [
  {
    did: "did:key:a",
    agentId: "did:key:a",
    role: "a",
    selfThreadId: "did:key:a-self",
    registeredStaticHash: "h1",
    turnCount: 0,
  },
  {
    did: "did:key:b",
    agentId: "did:key:b",
    role: "b",
    selfThreadId: "did:key:b-self",
    registeredStaticHash: "h2",
    turnCount: 0,
  },
];

test("swarm state tracks shared token budget and telemetry", async () => {
  resetSwarmStateClientForTests();
  const state = await createSwarmState(dataDir, config, agents);
  expect(await checkTokenBudgetRemainingStep(dataDir, state.id)).toBe(true);

  await incrementTokensUsedStep(dataDir, state.id, 60);
  await incrementTokensUsedStep(dataDir, state.id, 50);
  expect(await checkTokenBudgetRemainingStep(dataDir, state.id)).toBe(false);

  await recordTurnTelemetryStep(dataDir, state.id, {
    sessionId: config.sessionId,
    agentTurnIndex: 0,
    agentDid: agents[0]?.did,
    agentRole: "a",
    runId: "run-1",
    capabilities: {
      staticHash: "s",
      runtimeHash: "r",
      toolRefs: [],
    },
    memoriesProvenanceRootHex: "",
    threadHashes: [],
    inboxEntryIds: [],
  });

  const telemetry = await listTurnTelemetry(dataDir, config.sessionId);
  expect(telemetry).toHaveLength(1);
  expect(telemetry[0]?.runId).toBe("run-1");
});
