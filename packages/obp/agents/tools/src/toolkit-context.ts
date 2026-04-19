import type { ToolPipelineHooks, ToolkitContext, ToolRuntimeContext } from "@cfd/agent-identity";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";

export function buildObpToolkitContext(args: {
  env: ObpToolkitEnv;
  namespace?: string;
  agentId?: string;
  agentName?: string;
  pipelineHooks?: ToolPipelineHooks;
}): ToolkitContext<ObpToolkitEnv> {
  return {
    env: args.env,
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
    ...(args.pipelineHooks !== undefined ? { pipelineHooks: args.pipelineHooks } : {}),
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
