import type { RegisteredAgentIdentity } from "@cfd/agent-identity";
import { defineObpNegotiatorIdentity } from "@cfd/obp-negotiator";
import {
  appUserMemoryNamespace,
  matchmakingUserNamespaceSegment,
} from "../memories/app-user-memory-namespace.ts";
import { obpMatchmakingMemoryToolkit } from "../memories/composed-toolkit.ts";
import { resolveMatchmakingSubjectId } from "../resolve-subject-id.ts";
import { buildMatchmakingAppUserObpAgentNamespace } from "./build-obp-agent-namespace.ts";

/** OBP+memory agent for Party A: acts on the experiential user’s namespace (no marketing persona, no memory seeds). */
export async function buildAppUserRegisteredIdentity(): Promise<RegisteredAgentIdentity> {
  const subjectId = resolveMatchmakingSubjectId();
  const memoryNamespace = appUserMemoryNamespace(subjectId);
  const agentNamespace = buildMatchmakingAppUserObpAgentNamespace(subjectId);
  const userSeg = matchmakingUserNamespaceSegment();
  const { identity } = await defineObpNegotiatorIdentity(agentNamespace, {
    name: "You",
    rootComposable: obpMatchmakingMemoryToolkit,
    identityContext: {
      app: "matchmaking",
      subjectId,
      personaSlug: `user:${userSeg}`,
      memoryNamespace,
      contextVersion: 0,
    },
  });
  return identity;
}
