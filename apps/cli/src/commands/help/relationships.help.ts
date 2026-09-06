import type { CommandHelp } from "@khoralabs/cli-kit";

export const relationshipsListHelp: CommandHelp = {
  command: "relationships list",
  summary: "List your peer relationships (pending and accepted)",
  args: `khora relationships list [--json]`,
  wizard: `Peer relationships expand network visibility. Distinct from registration invite tokens (/v1/invite*).`,
};

export const relationshipsInviteHelp: CommandHelp = {
  command: "relationships invite",
  summary: "Invite a registered peer to connect",
  args: `khora relationships invite --peer=<did|username> [--json]`,
  wizard: `Creates a pending relationship and notifies the peer via inbox connection_request. Not a host registration invite.`,
};

export const relationshipsAcceptHelp: CommandHelp = {
  command: "relationships accept",
  summary: "Accept a pending relationship invite",
  args: `khora relationships accept <channelId> [--json]`,
};

export const relationshipsDeclineHelp: CommandHelp = {
  command: "relationships decline",
  summary: "Decline a pending relationship invite",
  args: `khora relationships decline <channelId> [--json]`,
  wizard: `Removes the pending graph edge. Does not purge inbox connection_request notifications.`,
};

export const relationshipsRevokeHelp: CommandHelp = {
  command: "relationships revoke",
  summary: "Revoke a pending invite you created",
  args: `khora relationships revoke <channelId> [--json]`,
  wizard: `Removes the pending graph edge. Does not purge the peer's inbox connection_request notification.`,
};

export const relationshipsDeleteHelp: CommandHelp = {
  command: "relationships delete",
  summary: "Delete a pending or accepted relationship",
  args: `khora relationships delete <channelId> [--json]`,
};
