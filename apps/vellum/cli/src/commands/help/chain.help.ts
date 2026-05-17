import type { CommandHelp } from "@khoralabs/cli-kit";

export const chainCreateHelp: CommandHelp = {
  command: "chain create",
  summary: "Create NBC chain state with a peer",
  args: `vellum [--room=id] chain create --peer-party=<uuid> --peer-key=<hex> [--genesis-json='<JSON>'|@path] [--session][--genesis][--my-party]`,
};

export const chainListHelp: CommandHelp = {
  command: "chain list",
  summary: "List chains from local store",
  args: `vellum [--room=id] chain list`,
};

export const chainSnapshotHelp: CommandHelp = {
  command: "chain snapshot",
  summary: "Print current chain snapshot",
  args: `vellum [--room=id] chain snapshot`,
};
