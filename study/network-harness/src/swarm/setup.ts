import { createRegisteredAgent } from "@khoralabs/agent-capabilities";

import { getAgentRegistry } from "../agent/agent-runtime.ts";
import { harnessToolkit } from "../agent/tools/index.ts";
import { spawnWithMemories, startNetworkHarness } from "../harness.ts";
import { InboxBuffer } from "./inbox-buffer.ts";
import { putSwarmSession, removeSwarmSession, type SwarmRuntimeSession } from "./session-store.ts";
import { createSwarmState } from "./swarm-state.ts";
import type { AgentLoopState, SwarmConfig } from "./types.ts";

function selfThreadId(did: string): string {
  return `${did}-self`;
}

export function validateSwarmConfig(config: SwarmConfig): void {
  if (config.roles.length !== config.agentCount) {
    throw new Error(
      `roles length (${config.roles.length}) must equal agentCount (${config.agentCount})`,
    );
  }
  if (config.agentCount < 1) throw new Error("agentCount must be at least 1");
}

export async function setupSwarm(config: SwarmConfig): Promise<{
  swarmStateId: string;
  sessionId: string;
  agents: AgentLoopState[];
}> {
  validateSwarmConfig(config);

  const harness = await startNetworkHarness({ dataDir: config.dataDir });
  const spawned = [];
  for (let i = 0; i < config.agentCount; i++) {
    spawned.push(await spawnWithMemories(harness));
  }

  const inboxBuffer = new InboxBuffer();
  const inboxConnections = [];
  const registry = getAgentRegistry();
  const loopStates: AgentLoopState[] = [];

  for (let i = 0; i < spawned.length; i++) {
    const agent = spawned[i];
    if (!agent) throw new Error("Agent not found");
    const role = config.roles[i];
    if (!role) throw new Error("Role not found");

    await agent.chat.createThread({
      id: selfThreadId(agent.did),
      metadata: { kind: "self", title: `${agent.did} self thread` },
    });

    const { staticHash, agent: registered } = await createRegisteredAgent({
      agentId: agent.did,
      name: `Agent ${i + 1}`,
      instructions: [config.goal, role],
      context: { sessionId: config.sessionId, did: agent.did, role },
      rootComposable: harnessToolkit,
    });
    if (!registry.has(agent.did)) {
      await registry.register(registered);
    }

    loopStates.push({
      did: agent.did,
      agentId: agent.did,
      role,
      selfThreadId: selfThreadId(agent.did),
      registeredStaticHash: staticHash,
      turnCount: 0,
    });

    inboxConnections.push(
      agent.agentHandle.connectInbox({
        onEvent: (event) => {
          inboxBuffer.push(agent.did, event);
        },
      }),
    );
  }

  const session: SwarmRuntimeSession = {
    config,
    harness,
    agents: spawned,
    loopStates,
    inboxBuffer,
    chatService: harness.signedChat.service,
    chatDb: harness.signedChat.db,
    lastInboxEntryByDid: new Map(spawned.map((agent) => [agent.did, undefined])),
    inboxConnections,
  };

  putSwarmSession(config.sessionId, session);

  const swarmState = await createSwarmState(config.dataDir, config, loopStates);
  return {
    swarmStateId: swarmState.id,
    sessionId: config.sessionId,
    agents: loopStates,
  };
}

export async function teardownSwarm(sessionId: string): Promise<void> {
  const session = removeSwarmSession(sessionId);
  if (session === undefined) return;
  for (const connection of session.inboxConnections ?? []) {
    connection.close();
  }
  session.harness.stop();
}
