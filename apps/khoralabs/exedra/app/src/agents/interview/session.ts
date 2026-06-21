import type { AgentRegistry, RegisteredAgent } from "@khoralabs/agent-capabilities";

import {
  buildInterviewAgentId,
  type DefineInterviewIdentityOptions,
  defineInterviewAgentIdentity,
} from "./identity.js";
import type { InterviewSessionMeta } from "./instructions.js";

export async function ensureInterviewAgentRegistered(
  registry: AgentRegistry,
  sessionId: string,
  meta: InterviewSessionMeta,
  options?: DefineInterviewIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgent }> {
  const id = buildInterviewAgentId(sessionId);
  if (registry.has(id)) {
    const entry = registry.get(id);
    if (entry === undefined) {
      throw new Error(`registry inconsistency: has(${id}) but get is undefined`);
    }
    return { staticHash: entry.agent.staticHash, identity: entry.agent };
  }
  const { staticHash, identity } = await defineInterviewAgentIdentity(sessionId, meta, options);
  await registry.register(identity);
  return { staticHash, identity };
}
