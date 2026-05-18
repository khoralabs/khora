import { buildCommandHelpTextMap } from "@khoralabs/cli-kit";

import { allCommandHelp } from "./help/index.ts";

const PROGRAM = "vellum";

export const commandHelpTextMap = buildCommandHelpTextMap(allCommandHelp, PROGRAM);

export function printHelp(): void {
  console.error(`${PROGRAM} — NBC over AT2 rooms (OBP v2)

Register on the host before rooms or connect (host may require invite token).

Usage:
  ${PROGRAM} help [<command> ...]
  ${PROGRAM} register ...
  ${PROGRAM} whoami [--base-url=…] [--json] [--no-fetch]
  ${PROGRAM} room create ...
  ${PROGRAM} room join ...
  ${PROGRAM} list [--data-dir=…] [--json]
  ${PROGRAM} connect <roomId>|--room=<id> [--base-url=…] [--ws-url=…]
  ${PROGRAM} [--room=id] chain create ...
  ${PROGRAM} [--room=id] chain list | chain snapshot
  ${PROGRAM} [--room=id] offer list | offer read <id> | offer send-turn ...
  ${PROGRAM} [--room=id] port list <offerId> | port read <portId>
  ${PROGRAM} [--room=id] policy read <portId> | policy validate <portId> --json=...
  ${PROGRAM} setup [--force] [--json]

Run \`${PROGRAM} <command> --help\` for per-command interactive vs flag usage.`);
}
