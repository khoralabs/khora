import type { ToolkitContext, ToolPipelineHooks, ToolRuntimeContext } from "@khoralabs/agent-identity";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";

export function buildObpToolkitContext<Env extends ObpToolkitEnv>(args: {
  env: Env;
  namespace?: string;
  agentId?: string;
  agentName?: string;
  pipelineHooks?: ToolPipelineHooks;
}): ToolkitContext<Env> {
  return {
    env: args.env,
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
    ...(args.pipelineHooks !== undefined ? { pipelineHooks: args.pipelineHooks } : {}),
  };
}

export function buildObpToolRuntimeContext<Env extends ObpToolkitEnv>(args: {
  env: Env;
  namespace?: string;
  agentId?: string;
  agentName?: string;
}): ToolRuntimeContext<Env> {
  return {
    env: args.env,
    namespace: args.namespace,
    agentId: args.agentId,
    agentName: args.agentName,
  };
}
