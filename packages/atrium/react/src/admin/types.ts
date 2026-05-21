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
  subscriptionEdges: number;
  registeredUsers: number;
};

export type AdminFramesStats = {
  activeRooms: number;
  totalFrames: number;
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

export type AdminSummary = {
  registeredUsers: number;
  invites: AdminInviteStats;
  teardown: AdminTeardownStats;
  catalog: AdminCatalogStats;
  frames: AdminFramesStats;
  cells: AdminCellsStats;
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
};
