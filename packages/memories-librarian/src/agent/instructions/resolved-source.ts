/**
 * Wraps resolved prefetch source body as a system instruction block.
 */
export function wrapResolvedSourceInstruction(resolvedBody: string): string {
  return `## Resolved source\n${resolvedBody}`;
}
