import {
  type AgentRegistry,
  createRegisteredAgent,
  type RegisteredAgent,
} from "@khoralabs/agent-capabilities";

import { facilitationBaseInstruction } from "./instructions.ts";
import { facilitationToolkit } from "./toolkit.ts";

export const EXEDRA_FACILITATION_AGENT_ID = "exedra-facilitation";

export function buildFacilitationAgentId(sessionId: string): string {
  return `${EXEDRA_FACILITATION_AGENT_ID}-${sessionId}`;
}

export async function defineFacilitationAgentIdentity(
  sessionId: string,
): Promise<{ staticHash: string; identity: RegisteredAgent }> {
  const { staticHash, agent } = await createRegisteredAgent({
    agentId: buildFacilitationAgentId(sessionId),
    name: "Facilitation Agent",
    instructions: [facilitationBaseInstruction],
    context: {
      role: "exedra-facilitation",
      sessionId,
    },
    rootComposable: facilitationToolkit,
  });
  return { staticHash, identity: agent };
}

export async function ensureFacilitationAgentRegistered(
  registry: AgentRegistry,
  sessionId: string,
): Promise<{ staticHash: string; identity: RegisteredAgent }> {
  const id = buildFacilitationAgentId(sessionId);
  if (registry.has(id)) {
    const entry = registry.get(id);
    if (entry === undefined) {
      throw new Error(`registry inconsistency: has(${id}) but get is undefined`);
    }
    return { staticHash: entry.agent.staticHash, identity: entry.agent };
  }
  const { staticHash, identity } = await defineFacilitationAgentIdentity(sessionId);
  await registry.register(identity);
  return { staticHash, identity };
}
