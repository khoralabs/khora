import type { CommandHelp } from "@khoralabs/cli-kit";

export const portListHelp: CommandHelp = {
  command: "port list",
  summary: "List ports for an offer",
  args: `vellum [--room=id] port list <offerId>`,
};

export const portReadHelp: CommandHelp = {
  command: "port read",
  summary: "Read one port by id",
  args: `vellum [--room=id] port read <portId>`,
};
