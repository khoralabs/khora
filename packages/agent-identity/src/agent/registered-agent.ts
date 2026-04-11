import { hashPlainObject } from "../hashing/hash.js";
import type { ToolSpec } from "../tool/types.js";
import type { Composable } from "../toolkit/types.js";
import type { AgentStaticProps, RegisteredAgentIdentity } from "./types";

export type CreateRegisteredAgentIdentityArgs<Env> = {
  agentId: string;
  name: string;
  instructions: string[];
  context?: Record<string, unknown>;
  rootComposable: Composable<{ kind: string; name: string }, Record<string, ToolSpec>, Env>;
};

/**
 * Builds a full {@link RegisteredAgentIdentity} from a root composable and agent-level static instructions.
 * Accepts any composable env `Env` (no caller cast); identity stores an env-erased composable for the registry.
 */
export async function createRegisteredAgentIdentity<Env>(
  args: CreateRegisteredAgentIdentityArgs<Env>,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  const rootComposableHash = await args.rootComposable.computeStaticHash();
  const agentInstructionLines = [...args.instructions].map((s) => s.trim()).filter(Boolean);
  const staticHash = await hashPlainObject({
    rootComposableHash,
    agentInstructions: agentInstructionLines,
  });
  const staticProps: AgentStaticProps = {
    kind: "registered-agent",
    agentId: args.agentId,
    name: args.name,
    instructions: [...args.instructions],
    context: { ...(args.context ?? {}) },
  };
  const identity: RegisteredAgentIdentity = {
    agentId: args.agentId,
    name: args.name,
    staticHash,
    staticProps,
    staticInstructions: [...args.instructions],
    staticContext: { ...(args.context ?? {}) },
    rootComposable: args.rootComposable as RegisteredAgentIdentity["rootComposable"],
  };
  return { staticHash, identity };
}
