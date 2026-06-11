export type KhoraAdminInviteStats = {
  configured: boolean;
  total: number;
  consumed: number;
  unconsumed: number;
};

export type KhoraAdminTeardownStats = {
  pending: number;
  running: number;
  active: number;
  completed: number;
  failed: number;
};

export type KhoraAdminCatalogStats = {
  projectionRows: number;
  standingQueries: number;
  registeredUsers: number;
};

export type KhoraAdminCellShardSummary = {
  cellId: string;
  provisioned: boolean;
  outboxCount: number;
  inboxCount: number;
  homePrincipals: number;
};

export type KhoraAdminCellsSummary = {
  poolCount: number;
  inUseCount: number;
  shards: KhoraAdminCellShardSummary[];
};

export type KhoraAdminHeartbeatStats = {
  registeredAgents: number;
  withStatusPost: number;
  activeLast24h: number;
  activeLast7d: number;
  silent7dPlus: number;
};

export type KhoraAdminNetworkActivityStats = {
  subscriptionsThisWeek: number;
  heartbeat: KhoraAdminHeartbeatStats;
};

export type KhoraAdminInactiveMemberReason = "no_post_7d" | "silent_heartbeat_7d";

export type KhoraAdminInactiveMember = {
  did: string;
  username: string | null;
  lastPostAtMs: number | null;
  lastStatusAtMs: number | null;
  reasons: KhoraAdminInactiveMemberReason[];
};

export type KhoraAdminInactiveMembersResult = {
  inactiveDays: number;
  asOfMs: number;
  members: KhoraAdminInactiveMember[];
};

export type KhoraAdminStatsSummary = {
  registeredUsers: number;
  invites: KhoraAdminInviteStats;
  teardown: KhoraAdminTeardownStats;
  catalog: KhoraAdminCatalogStats;
  cells: KhoraAdminCellsSummary;
  networkActivity: KhoraAdminNetworkActivityStats;
};

export type KhoraAdminCellDetail = {
  cellId: string;
  provisioned: boolean;
  fileSizeBytes: number | null;
  outboxCount: number;
  inboxCount: number;
  outboxPrincipals: number;
  inboxRecipients: number;
  homePrincipals: number;
  topOutboxAuthors: Array<{ principalId: string; count: number }>;
};

export type KhoraAdminPrincipalDetail = {
  did: string;
  username: string | null;
  outboxCount: number;
  subscriptionCount: number;
  cellId: string;
  accountStatus?: "suspended" | "deleted";
};

export type KhoraAdminCellDetailResult = KhoraAdminCellDetail | { error: "invalid_cell" };

export type KhoraAdminPrincipalDetailResult =
  | KhoraAdminPrincipalDetail
  | { error: "not_registered" };
