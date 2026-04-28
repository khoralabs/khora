import { matchmakingPersonalMemoryNamespace } from "./matchmaking-memory-namespaces.ts";

/**
 * Cross-subject personal namespace for a simulated persona.
 */
export function matchmakingPersonaMemoryNamespace(
  slug: string,
  _subjectId?: string,
): string {
  return matchmakingPersonalMemoryNamespace(slug);
}
