import type { CommandHelp } from "./types.ts";

export const configHelp: CommandHelp = {
  command: "config",
  summary: "Inspect and edit the resolved Atrium config file. Subcommand-based (no wizard).",
  args: `atrium config path
  Print the resolved config file path. Exits 2 (with the would-be default path
  on stdout and a note on stderr) when no file is in use.
atrium config show [--raw | --source]
  Default: print the effective merged config (defaults + env + file + extends)
  as pretty JSON. --raw prints the entry file's bytes verbatim. --source prints
  the entry path then each parent in the extends chain on its own line.
atrium config edit
  Open the resolved config file in $VISUAL (else $EDITOR, else 'vi'). When the
  file does not exist, the parent directory and a minimal stub are created.`,
};
