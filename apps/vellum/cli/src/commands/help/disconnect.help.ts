import type { CommandHelp } from "@khoralabs/cli-kit";

export const disconnectHelp: CommandHelp = {
  command: "disconnect",
  summary: "Stop the local daemon for a room (closes WebSocket only)",
  args: `vellum disconnect <roomId> [--data-dir=…]`,
};
