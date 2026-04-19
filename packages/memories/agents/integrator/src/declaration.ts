import type { AgentRegistry } from "@cfd/agent-identity";
import {
  type DefineMemoryIntegratorIdentityOptions,
  defineMemoryIntegratorIdentity,
} from "./identity.js";
import { memoryIntegratorRegistryRegistration } from "./integrator-session.js";

export type {
  MemoryIntegratorSessionContext,
  MemoryIntegratorSessionInput,
  MemoryIntegratorSessionOutput,
} from "./integrator-session.js";

export async function registerMemoryIntegratorAgent(
  registry: AgentRegistry,
  namespace: string,
  options?: DefineMemoryIntegratorIdentityOptions,
): Promise<{
  staticHash: string;
  identity: Awaited<ReturnType<typeof defineMemoryIntegratorIdentity>>["identity"];
}> {
  const { staticHash, identity } = await defineMemoryIntegratorIdentity(namespace, options);
  registry.register(identity, memoryIntegratorRegistryRegistration());
  return { staticHash, identity };
}

export async function declareMemoryIntegratorAgent(
  namespace: string,
  options?: DefineMemoryIntegratorIdentityOptions,
) {
  const { staticHash, identity } = await defineMemoryIntegratorIdentity(namespace, options);
  return {
    staticHash,
    identity,
    registration: memoryIntegratorRegistryRegistration(),
  };
}
