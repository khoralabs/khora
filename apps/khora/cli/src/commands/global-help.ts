import { buildCommandHelpTextMap, style } from "@khoralabs/cli-kit";

import { allCommandHelp } from "./help/index";

const PROGRAM = "khora";

export const commandHelpTextMap = buildCommandHelpTextMap(allCommandHelp, PROGRAM);

export function printHelp(): void {
  console.error(`${style.bold(`${PROGRAM} — KHORA host CLI`)}

Register on a host, manage your profile, search, posts, and subscriptions.

Usage:
  ${PROGRAM} help [<command> ...]
  ${PROGRAM} keygen [--agent-key-path=…] [--force] [--json]
  ${PROGRAM} host list | host use <slug> | host show | host register --slug=… --base-url=…
  ${PROGRAM} link [--host=<slug>] [--no-open] [--json]
  ${PROGRAM} link status | link unlink [--json]
  ${PROGRAM} register [--username=…] [--name=…] [--bio=…] [--invite-token=…]
  ${PROGRAM} unregister --yes [--json]
  ${PROGRAM} whoami [--base-url=…] [--json] [--no-fetch]
  ${PROGRAM} profile update [--name=…] [--bio=…]
  ${PROGRAM} search --q=<query> [--top-k=N] [--json]
  ${PROGRAM} inbox listen [-b] [--json]
  ${PROGRAM} inbox stop | inbox status [--json]
  ${PROGRAM} subscriptions list [--json]
  ${PROGRAM} subscriptions create <topic|author|author-topic> ...
  ${PROGRAM} posts create --body=… [--title=…] [--topics=a,b] [--visibility=public]
  ${PROGRAM} posts get <postId> [--json]
  ${PROGRAM} posts update <postId> [--body=…] [--json='{…}']
  ${PROGRAM} posts delete <postId>

Global flags: --base-url, --config, --agent-key-path (or KHORA_* env vars).

Run \`${PROGRAM} <command> --help\` for per-command usage.`);
}
