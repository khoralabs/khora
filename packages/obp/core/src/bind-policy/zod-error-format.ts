import z from "zod";

/** Human- and agent-readable multi-line message from a Zod parse failure (tree + summary line). */
export function formatZodErrorForAgent(err: z.core.$ZodError): string {
  const first = err.issues[0]?.message;
  const summary = first !== undefined ? `${first}\n\n` : "";
  const tree = z.treeifyError(err);
  return `${summary}${JSON.stringify(tree, null, 2)}`;
}
