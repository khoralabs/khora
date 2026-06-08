import type { CommandHelp } from "@khoralabs/cli-kit";

export const hostListHelp: CommandHelp = {
  command: "host list",
  summary: "List active hosts from the registry catalog",
  args: "khora host list [--registry-url=…] [--json]",
};

export const hostUseHelp: CommandHelp = {
  command: "host use",
  summary: "Select the current Khora host for CLI commands",
  args: "khora host use <slug> [--json]",
};

export const hostShowHelp: CommandHelp = {
  command: "host show",
  summary: "Show current host slug and resolved base URL",
  args: "khora host show [--host=…] [--base-url=…] [--json]",
};

export const hostRegisterHelp: CommandHelp = {
  command: "host register",
  summary: "Register a host in the registry (pending until activated)",
  args: "khora host register --slug=<slug> --base-url=<url> [--name=…] [--description=…] [--json]",
};
