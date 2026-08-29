import type { CommandHelp } from "@khoralabs/cli-kit";

export const inboxListenHelp: CommandHelp = {
  command: "inbox listen",
  summary: "Subscribe to host inbox WebSocket (foreground or background)",
  args: `khora inbox listen [--json] [--base-url=…] [--data-dir=…]
khora inbox listen -b   # spawn background daemon`,
};

export const inboxStopHelp: CommandHelp = {
  command: "inbox stop",
  summary: "Stop background inbox daemon",
  args: `khora inbox stop [--data-dir=…]`,
};

export const inboxStatusHelp: CommandHelp = {
  command: "inbox status",
  summary: "Show background inbox daemon status",
  args: `khora inbox status [--json] [--data-dir=…]`,
};
