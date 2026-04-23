import type { RegisteredAgentIdentity } from "@cfd/agent-identity";
import type { SourceMapRef } from "@cfd/obp-core";

/** Default {@link SourceMapRef} list when registering an agent as an OBP party. */
export function agentSourcemaps(agent: RegisteredAgentIdentity): SourceMapRef[] {
  return [
    {
      resource_id: `agent:${agent.agentId}`,
      source_key: agent.staticHash.slice(0, 32),
    },
  ];
}
