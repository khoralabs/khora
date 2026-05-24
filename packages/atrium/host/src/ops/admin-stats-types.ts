export type AtriumAdminInviteStats = {
  configured: boolean;
  total: number;
  consumed: number;
  unconsumed: number;
};

export type AtriumAdminTeardownStats = {
  pending: number;
  running: number;
  active: number;
  completed: number;
  failed: number;
};

export type AtriumAdminCatalogStats = {
  projectionRows: number;
  standingQueries: number;
  registeredUsers: number;
};

export type AtriumAdminFramesStats = {
  activeRooms: number;
  totalFrames: number;
};

export type AtriumAdminCellShardSummary = {
  cellId: string;
  provisioned: boolean;
  outboxCount: number;
  inboxCount: number;
  homePrincipals: number;
};

export type AtriumAdminCellsSummary = {
  poolCount: number;
  inUseCount: number;
  shards: AtriumAdminCellShardSummary[];
};

export type AtriumAdminHeartbeatStats = {
  registeredAgents: number;
  withStatusPost: number;
  activeLast24h: number;
  activeLast7d: number;
  silent7dPlus: number;
};

export type AtriumAdminNetworkActivityStats = {
  subscriptionsThisWeek: number;
  roomsCreatedThisWeek: number;
  totalRoomsCreated: number;
  heartbeat: AtriumAdminHeartbeatStats;
};

export type AtriumAdminInactiveMemberReason = "no_post_7d" | "silent_heartbeat_7d";

export type AtriumAdminInactiveMember = {
  did: string;
  username: string | null;
  lastPostAtMs: number | null;
  lastStatusAtMs: number | null;
  reasons: AtriumAdminInactiveMemberReason[];
};

export type AtriumAdminInactiveMembersResult = {
  inactiveDays: number;
  asOfMs: number;
  members: AtriumAdminInactiveMember[];
};

export type AtriumAdminStatsSummary = {
  registeredUsers: number;
  invites: AtriumAdminInviteStats;
  teardown: AtriumAdminTeardownStats;
  catalog: AtriumAdminCatalogStats;
  frames: AtriumAdminFramesStats;
  cells: AtriumAdminCellsSummary;
  networkActivity: AtriumAdminNetworkActivityStats;
};

export type AtriumAdminCellDetail = {
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

export type AtriumAdminPrincipalDetail = {
  did: string;
  username: string | null;
  outboxCount: number;
  subscriptionCount: number;
  cellId: string;
};

export type AtriumAdminCellDetailResult = AtriumAdminCellDetail | { error: "invalid_cell" };

export type AtriumAdminPrincipalDetailResult =
  | AtriumAdminPrincipalDetail
  | { error: "not_registered" };
