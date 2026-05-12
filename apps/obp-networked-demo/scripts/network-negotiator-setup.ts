import {
  type AgentRegistry,
  createAgentRegistry,
  type RegisteredAgentIdentity,
} from "@khoralabs/agent-identity";
import { ensureObpNegotiatorStructuredAgentRegistered } from "@khoralabs/obp-negotiator";

const RESPONDER_ROLE_INSTRUCTION =
  "Private role: you are the responder over HTTP/2 OBP frames. Read each user message bind menu and reply using structured negotiation JSON exactly matching schema keys (opaque port UUIDs). Prefer constructive binds, noop to defer, or walk-away only when negotiation must stop.";

const INITIATOR_ROLE_INSTRUCTION =
  "Private role: you are the initiator. Your genesis turn must set offerType and expose at least one non-terminal port the responder can bind. Later binds must target exact port ids from the bind menu.";

export type NetworkNegotiatorBundle = {
  registry: AgentRegistry;
  identity: RegisteredAgentIdentity;
};

export async function setupResponderNegotiator(): Promise<NetworkNegotiatorBundle> {
  const registry = createAgentRegistry();
  const { identity } = await ensureObpNegotiatorStructuredAgentRegistered(
    registry,
    "obp-network-server",
    {
      name: "OBP network responder",
      instructions: [RESPONDER_ROLE_INSTRUCTION],
    },
  );
  return { registry, identity };
}

export async function setupInitiatorNegotiator(): Promise<NetworkNegotiatorBundle> {
  const registry = createAgentRegistry();
  const { identity } = await ensureObpNegotiatorStructuredAgentRegistered(
    registry,
    "obp-network-client",
    {
      name: "OBP network initiator",
      instructions: [INITIATOR_ROLE_INSTRUCTION],
    },
  );
  return { registry, identity };
}
