import type { RegisteredAgentIdentity } from "@khoralabs/agent-identity";
import { defineObpNegotiatorIdentity } from "@khoralabs/obp-negotiator";
import { obpMatchmakingMemoryToolkit } from "../memories/composed-toolkit.ts";
import { matchmakingPersonaMemoryNamespace } from "../memories/matchmaking-persona-memory-namespace.ts";
import { resolveMatchmakingSubjectId } from "../resolve-subject-id.ts";
import { buildMatchmakingObpAgentNamespace } from "./build-obp-agent-namespace.ts";

/** One composable; per-seat and subject binding comes from namespace + `identityContext` (not from duplicating the template for lineage). */
export async function createGenericMatchmakingNegotiatorIdentity(args: {
  personaSlug: string;
  displayName: string;
}): Promise<RegisteredAgentIdentity> {
  const subjectId = resolveMatchmakingSubjectId();
  const memoryNamespace = matchmakingPersonaMemoryNamespace(args.personaSlug, subjectId);
  const agentNamespace = buildMatchmakingObpAgentNamespace(args.personaSlug, subjectId);
  const { identity } = await defineObpNegotiatorIdentity(agentNamespace, {
    name: args.displayName,
    rootComposable: obpMatchmakingMemoryToolkit,
    identityContext: {
      app: "matchmaking",
      subjectId,
      personaSlug: args.personaSlug,
      memoryNamespace,
      contextVersion: 0,
    },
  });
  return identity;
}
