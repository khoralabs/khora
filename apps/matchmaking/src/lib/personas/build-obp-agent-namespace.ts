import { resolveMatchmakingSubjectId } from "../resolve-subject-id.ts";

const SAFE = /[^a-zA-Z0-9._-]+/g;

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
