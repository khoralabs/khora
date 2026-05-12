import {
  defaultIdentityPath,
  generateAgentIdentity,
  loadIdentity,
  saveIdentity,
} from "@khoralabs/atrium-auth";
import { boolFlag, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

export type KeySubcommand = "generate" | "show" | "path";

export async function runKeyCommand(sub: string | undefined, flags: FlagMap): Promise<void> {
  switch (sub) {
    case "generate":
      await runKeyGenerate(flags);
      return;
    case "show":
      await runKeyShow(flags);
      return;
    case "path":
      runKeyPath(flags);
      return;
    default:
      console.error("key: subcommand required: generate | show | path");
      process.exit(1);
  }
}

async function runKeyGenerate(flags: FlagMap): Promise<void> {
  const out = strFlag(flags, "out") ?? defaultIdentityPath();
  const force = boolFlag(flags, "force", "f");
  if (!force) {
    const existing = await loadIdentity(out);
    if (existing !== undefined) {
      console.error(
        `Identity already exists at ${out} (did=${existing.did}). Re-run with --force to overwrite.`,
      );
      process.exit(1);
    }
  }
  const signer = await generateAgentIdentity();
  await saveIdentity(out, signer);
  console.log(JSON.stringify({ did: signer.did, path: out }, null, 2));
}

async function runKeyShow(flags: FlagMap): Promise<void> {
  const path = strFlag(flags, "path") ?? defaultIdentityPath();
  const signer = await loadIdentity(path);
  if (signer === undefined) {
    console.error(`No identity at ${path}. Run 'atrium key generate' first.`);
    process.exit(1);
  }
  console.log(JSON.stringify({ did: signer.did, path }, null, 2));
}

function runKeyPath(_flags: FlagMap): void {
  console.log(defaultIdentityPath());
}
