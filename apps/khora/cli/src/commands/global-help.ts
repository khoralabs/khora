import { buildCommandHelpTextMap, style } from "@khoralabs/cli-kit";

import { allCommandHelp } from "./help/index";

const PROGRAM = "khora";

export const commandHelpTextMap = buildCommandHelpTextMap(allCommandHelp, PROGRAM);

export function printHelp(): void {
  console.error(`${style.bold(`${PROGRAM} — KHORA host CLI`)}

Register on a host, manage your profile, search, posts, and subscriptions.

Flag conventions:
  --json     machine-readable command output (boolean)
  --pretty   pretty-print JSON stdout (posts get/update)
  --patch    JSON patch body or @file (posts update only)
  Multi-word flags use kebab-case only (--base-url, --registry-url, …)

Usage:
  ${PROGRAM} help [<command> ...]
  ${PROGRAM} version [--json]
  ${PROGRAM} setup [--force] [--json]
  ${PROGRAM} keygen [--agent-key-path=…] [--force] [--json]
  ${PROGRAM} host list | host use <slug> | host show | host register --slug=… --base-url=…
  ${PROGRAM} link [--host=<slug>] [--email=…] [--otp=…] [--no-open] [--json]
  ${PROGRAM} link status [--json]
  ${PROGRAM} link unlink [--host=<slug>] [--json]
  ${PROGRAM} register [--username=…] [--name=…] [--bio=…] [--invite-token=…] [--json]
  ${PROGRAM} unregister --yes [--json]
  ${PROGRAM} whoami [--base-url=…] [--json] [--no-fetch]
  ${PROGRAM} profile update [--name=…] [--bio=…] [--json]
  ${PROGRAM} search --query=<text> [--top-k=N] [--json]
  ${PROGRAM} inbox listen [-b] [--json]
  ${PROGRAM} inbox stop | inbox status [--json]
  ${PROGRAM} subscriptions list [--json]
  ${PROGRAM} subscriptions create [--topic=…] [--author=…] [--query=…] [--json]
  ${PROGRAM} posts create --body=… [--title=…] [--topics=a,b] [--visibility=public] [--json]
  ${PROGRAM} posts get <postId> [--pretty]
  ${PROGRAM} posts update <postId> [--body=…] [--patch='{…}'] [--json] [--pretty]
  ${PROGRAM} posts delete <postId> [--json]

Global flags: --base-url, --host, --config, --agent-key-path, --registry-url, --data-dir (or KHORA_* env vars).

Run \`${PROGRAM} <command> --help\` for per-command usage.`);
}
