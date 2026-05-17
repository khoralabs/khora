import type { CommandHelp } from "@khoralabs/cli-kit";

export const policyReadHelp: CommandHelp = {
  command: "policy read",
  summary: "Read policy snapshot for a port",
  args: `vellum [--room=id] policy read <portId>`,
};

export const policyValidateHelp: CommandHelp = {
  command: "policy validate",
  summary: "Validate a payload against a port policy",
  args: `vellum [--room=id] policy validate <portId> --json='<payload>'`,
};
