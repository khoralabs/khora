import type { CommandHelp } from "./types.ts";

export const keyHelp: CommandHelp = {
  command: "key",
  summary: "Manage the local Ed25519 did:key identity. Subcommand-based (no wizard).",
  args: `atrium key generate [--out <path>] [--force]
  Create a new keypair (default: ~/.atrium/identity.json).
atrium key show [--path <path>]
  Print the DID for an existing identity file.
atrium key path
  Print the default identity path.`,
};
