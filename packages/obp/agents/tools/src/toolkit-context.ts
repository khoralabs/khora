import type { ToolkitContext, ToolRuntimeContext } from "@cfd/agent-identity";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";

export function buildObpToolkitContext(args: {
  env: ObpToolkitEnv;
  namespace?: string;
  agentId?: string;
  agentName?: string;
}): ToolkitContext<ObpToolkitEnv> {
  return {
    env: args.env,
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
  };
}

export function buildObpToolRuntimeContext(args: {
  env: ObpToolkitEnv;
  namespace?: string;
  agentId?: string;
  agentName?: string;
}): ToolRuntimeContext<ObpToolkitEnv> {
  return {
    env: args.env,
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
  };
}
