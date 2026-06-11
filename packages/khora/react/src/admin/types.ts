export type AdminInviteStats = {
  configured: boolean;
  total: number;
  consumed: number;
  unconsumed: number;
};

export type AdminTeardownStats = {
  pending: number;
  running: number;
  active: number;
  completed: number;
  failed: number;
};

export type AdminCatalogStats = {
  projectionRows: number;
  standingQueries: number;
  registeredUsers: number;
};

export type AdminCellShardSummary = {
  cellId: string;
  provisioned: boolean;
  outboxCount: number;
  inboxCount: number;
  homePrincipals: number;
};

export type AdminCellsStats = {
  poolCount: number;
  inUseCount: number;
  shards: AdminCellShardSummary[];
};

export type AdminHeartbeatStats = {
  registeredAgents: number;
  withStatusPost: number;
  activeLast24h: number;
  activeLast7d: number;
  silent7dPlus: number;
};

export type AdminNetworkActivityStats = {
  subscriptionsThisWeek: number;
  heartbeat: AdminHeartbeatStats;
};

export type AdminInactiveMemberReason = "no_post_7d" | "silent_heartbeat_7d";

export type AdminInactiveMember = {
  did: string;
  username: string | null;
  lastPostAtMs: number | null;
  lastStatusAtMs: number | null;
  reasons: AdminInactiveMemberReason[];
};

export type AdminInactiveMembersResult = {
  inactiveDays: number;
  asOfMs: number;
  members: AdminInactiveMember[];
};

export type AdminSummary = {
  registeredUsers: number;
  invites: AdminInviteStats;
  teardown: AdminTeardownStats;
  catalog: AdminCatalogStats;
  cells: AdminCellsStats;
  networkActivity: AdminNetworkActivityStats;
};

export type AdminCellDetail = {
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

export type AdminPrincipal = {
  did: string;
  username: string | null;
  outboxCount: number;
  subscriptionCount: number;
  cellId: string;
  accountStatus?: "suspended" | "deleted";
};
