import type { CommandHelp } from "@khoralabs/cli-kit";

export const offerListHelp: CommandHelp = {
  command: "offer list",
  summary: "List offers for the current room",
  args: `vellum [--room=id] offer list`,
};

export const offerReadHelp: CommandHelp = {
  command: "offer read",
  summary: "Read one offer by id",
  args: `vellum [--room=id] offer read <offerId>`,
};

export const offerSendTurnHelp: CommandHelp = {
  command: "offer send-turn",
  summary: "Send an NBC turn body for a session",
  args: `vellum [--room=id] offer send-turn --session=<id> --json='<JSON>'|--json=@path.json`,
};
