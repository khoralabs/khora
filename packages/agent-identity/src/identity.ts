import type { RegisteredAgentIdentity } from "./types.js";

export function defineAgentIdentity(args: {
  agentId: string;
  name: string;
  staticHash: string;
}): RegisteredAgentIdentity {
  return {
    agentId: args.agentId,
    name: args.name,
    staticHash: args.staticHash,
  };
}

export type { RegisteredAgentIdentity } from "./types.js";
