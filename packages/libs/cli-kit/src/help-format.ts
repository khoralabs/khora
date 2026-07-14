import type { CommandHelp } from "./types";

function indent(block: string, pad: string): string {
  return block
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}

/**
 * Format a single command's help. Uses “Interactive” / “Non-interactive (flags)”
 * labels while {@link CommandHelp} keeps `wizard` / `args` field names.
 */
export function formatHelp(programName: string, h: CommandHelp): string {
  const parts: string[] = [`${programName} ${h.command}  -  ${h.summary}`];
  if (h.wizard !== undefined) {
    parts.push("", "Interactive:", indent(h.wizard, "  "));
  }
  if (h.args !== undefined) {
    parts.push("", "Non-interactive (flags):", indent(h.args, "  "));
  }
  return parts.join("\n");
}

export function buildCommandHelpTextMap(
  entries: readonly CommandHelp[],
  programName: string,
): Record<string, string> {
  return Object.fromEntries(entries.map((h) => [h.command, formatHelp(programName, h)]));
}

/** Longest prefix match on first 3 / 2 / 1 positional tokens. */
export function tryPrintCommandHelp(
  positional: string[],
  commandHelpText: Record<string, string>,
): boolean {
  const three = positional.slice(0, 3).join(" ");
  const two = positional.slice(0, 2).join(" ");
  const one = positional[0] ?? "";
  const text = commandHelpText[three] ?? commandHelpText[two] ?? commandHelpText[one];
  if (text === undefined) return false;
  console.log(text);
  return true;
}
