import { buildCommandHelpTextMap, style } from "@khoralabs/cli-kit";

import { allCommandHelp } from "./help/index";

const PROGRAM = "vellum";

export const commandHelpTextMap = buildCommandHelpTextMap(allCommandHelp, PROGRAM);

export function printHelp(): void {
  console.error(`${style.bold(`${PROGRAM} — NBC tools for Vellum channels`)}

Register on Khora for discovery; create channels on the Vellum channel-relay.

Usage:
  ${PROGRAM} help [<command> ...]
  ${PROGRAM} keygen [--agent-key-path=…] [--force] [--json]
  ${PROGRAM} register ... [--khora-base-url=…]
  ${PROGRAM} whoami [--khora-base-url=…] [--json] [--no-fetch]
  ${PROGRAM} channel create ...
  ${PROGRAM} channel join ...
  ${PROGRAM} channel connect <channelId>|--channel=<id> [--base-url=…] [--ws-url=…]
  ${PROGRAM} list [--data-dir=…] [--json]
  ${PROGRAM} disconnect <channelId> [--data-dir=…]
  ${PROGRAM} connect …   # shorthand for channel connect
  ${PROGRAM} [--channel=id] chain create ...
  ${PROGRAM} [--channel=id] chain list | chain snapshot
  ${PROGRAM} [--channel=id] offer list | offer read <id> | offer send-turn ...
  ${PROGRAM} [--channel=id] port list <offerId> | port read <portId>
  ${PROGRAM} [--channel=id] policy read <portId> | policy validate <portId> --json=...
  ${PROGRAM} setup [--force] [--json]

Env: VELLUM_BASE_URL (relay), KHORA_BASE_URL (discovery), VELLUM_CHANNEL_ID

Run \`${PROGRAM} <command> --help\` for per-command interactive vs flag usage.`);
}
