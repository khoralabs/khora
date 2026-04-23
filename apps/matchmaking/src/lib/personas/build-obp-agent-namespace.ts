import { matchmakingUserNamespaceSegment } from "../memories/app-user-memory-namespace.ts";
import { resolveMatchmakingSubjectId } from "../resolve-subject-id.ts";

const SAFE = /[^a-zA-Z0-9._-]+/g;

/**
 * OBP negotiator `agentNamespace` for the experiential app user (not a demo persona slug).
 * Distinct from {@link buildMatchmakingObpAgentNamespace} so agent ids never collide with p1/p2/p3.
 */
export function buildMatchmakingAppUserObpAgentNamespace(
  subjectId: string = resolveMatchmakingSubjectId(),
): string {
  const sub = subjectId.replace(SAFE, "-");
  const u = matchmakingUserNamespaceSegment().replace(SAFE, "-");
  return `matchmaking--${sub}--app-user--${u}`;
}

/**
 * OBP negotiator `agentNamespace` segment: subject + slug (separate from memory KG path).
 * Used with {@link import("@cfd/obp-negotiator").buildObpNegotiatorAgentId}.
 */
export function buildMatchmakingObpAgentNamespace(
  slug: string,
  subjectId: string = resolveMatchmakingSubjectId(),
): string {
  const sub = subjectId.replace(SAFE, "-");
  return `matchmaking--${sub}--${slug}`;
}
