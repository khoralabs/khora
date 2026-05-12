import {
  type AnyComposable,
  createRegisteredAgentIdentity,
  type RegisteredAgentIdentity,
} from "@khoralabs/agent-identity";
import { obpToolkit } from "@khoralabs/obp-tools";
import { obpNegotiatorBaseInstruction } from "./instructions.ts";

/** Accepts {@code obpToolkit} and composed roots (OBP + memory, etc.); identity erases env at registration. */
// biome-ignore lint/suspicious/noExplicitAny: composable env is host-specific (intersections, unions of toolkit envs)
type ObpNegotiatorRootComposableInput = AnyComposable<any>;

export const OBP_NEGOTIATOR_AGENT_ID = "obp-negotiator";

export function buildObpNegotiatorAgentId(namespace: string): string {
  return `${OBP_NEGOTIATOR_AGENT_ID}-${namespace}`;
}

export type DefineObpNegotiatorIdentityOptions = {
  /** Display name for tooling (default: "OBP Negotiator"). */
  name?: string;
  /** Merged into \`createRegisteredAgentIdentity\` context. */
  identityContext?: Record<string, unknown>;
  /** Additional instructions to merge into the base instruction. */
  instructions?: string[];
  /**
   * Root toolkit composable. Defaults to {@code obpToolkit} from {@code @khoralabs/obp-tools}.
   * Set to a composed composable (e.g. OBP + memory) when the host needs extra tools.
   */
  rootComposable?: ObpNegotiatorRootComposableInput;
};

/**
 * Registered identity: OBP toolkit + negotiator base instructions.
 * Use distinct namespaces (e.g. buyer vs seller) when multiple agents share a host.
 */
export async function defineObpNegotiatorIdentity(
  namespace: string,
  options?: DefineObpNegotiatorIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  return createRegisteredAgentIdentity({
    agentId: buildObpNegotiatorAgentId(namespace),
    name: options?.name ?? "OBP Negotiator",
    instructions: [...(options?.instructions ?? []), obpNegotiatorBaseInstruction],
    context: {
      role: "obp-negotiator",
      targetNamespace: namespace,
      ...(options?.identityContext ?? {}),
    },
    rootComposable: (options?.rootComposable ??
      obpToolkit) as RegisteredAgentIdentity["rootComposable"],
  });
}
