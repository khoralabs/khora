import type { RegisteredAgentIdentity } from "@khoralabs/agent-identity";
import { defineObpNegotiatorIdentity } from "@khoralabs/obp-negotiator";
import {
  appUserMemoryNamespace,
  matchmakingUserNamespaceSegment,
} from "../memories/app-user-memory-namespace.ts";
import { obpMatchmakingMemoryToolkit } from "../memories/composed-toolkit.ts";
import { resolveMatchmakingSubjectId } from "../resolve-subject-id.ts";
import { buildMatchmakingAppUserObpAgentNamespace } from "./build-obp-agent-namespace.ts";

/** OBP+memory agent for Party A: acts on the experiential user’s namespace (no marketing persona, no memory seeds). */
export async function buildAppUserRegisteredIdentity(options?: {
  /** Shown in transcripts / dev logs; defaults to `"You"` when omitted or empty. */
  displayName?: string;
}): Promise<RegisteredAgentIdentity> {
  const subjectId = resolveMatchmakingSubjectId();
  const memoryNamespace = appUserMemoryNamespace(subjectId);
  const agentNamespace = buildMatchmakingAppUserObpAgentNamespace(subjectId);
  const userSeg = matchmakingUserNamespaceSegment();
  const name =
    typeof options?.displayName === "string" && options.displayName.trim().length > 0
      ? options.displayName.trim()
      : "You";
  const { identity } = await defineObpNegotiatorIdentity(agentNamespace, {
    name,
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
