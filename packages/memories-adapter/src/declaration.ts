import type { AgentRegistry } from "@cfd/agent-identity";
import { memoryAdapterRegistryRegistration } from "./adapter-session.js";
import {
  type DefineMemoryAdapterIdentityOptions,
  defineMemoryAdapterIdentity,
} from "./identity.js";

export type {
  MemoryAdapterSessionContext,
  MemoryAdapterSessionInput,
  MemoryAdapterSessionOutput,
} from "./adapter-session.js";

/**
 * Registers the memory adapter identity and session runner on the registry (same pattern as the librarian).
 */
export async function registerMemoryAdapterAgent(
  registry: AgentRegistry,
  namespace: string,
  options?: DefineMemoryAdapterIdentityOptions,
): Promise<{
  staticHash: string;
  identity: Awaited<ReturnType<typeof defineMemoryAdapterIdentity>>["identity"];
}> {
  const { staticHash, identity } = await defineMemoryAdapterIdentity(namespace, options);
  registry.register(identity, memoryAdapterRegistryRegistration());
  return { staticHash, identity };
}

export async function declareMemoryAdapterAgent(
  namespace: string,
  options?: DefineMemoryAdapterIdentityOptions,
) {
  const { staticHash, identity } = await defineMemoryAdapterIdentity(namespace, options);
  return {
    staticHash,
    identity,
    registration: memoryAdapterRegistryRegistration(),
  };
}
