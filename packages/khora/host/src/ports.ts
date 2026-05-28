import type { CellPersistenceStrategy, OutboxListedRecord } from "@khoralabs/colonnade-persistence";
import type { KhoraPost } from "@khoralabs/khora-contracts";
import type {
  KhoraAdminCellDetailResult,
  KhoraAdminInactiveMembersResult,
  KhoraAdminPrincipalDetailResult,
  KhoraAdminStatsSummary,
} from "./ops/admin-stats-types.ts";

export type {
  KhoraAdminCatalogStats,
  KhoraAdminCellDetail,
  KhoraAdminCellDetailResult,
  KhoraAdminCellShardSummary,
  KhoraAdminCellsSummary,
  KhoraAdminFramesStats,
  KhoraAdminHeartbeatStats,
  KhoraAdminInactiveMember,
  KhoraAdminInactiveMemberReason,
  KhoraAdminInactiveMembersResult,
  KhoraAdminInviteStats,
  KhoraAdminNetworkActivityStats,
  KhoraAdminPrincipalDetail,
  KhoraAdminPrincipalDetailResult,
  KhoraAdminStatsSummary,
  KhoraAdminTeardownStats,
} from "./ops/admin-stats-types.ts";

export type KhoraColonnadeCluster = {
  readonly cellPoolCount: number | undefined;
  resolveCell(cellId: string): CellPersistenceStrategy;
  assignPrincipalToCell(principalId: string): string;
  close(): void;
};

export type PostResolver = {
  resolvePostById(id: string): Promise<KhoraPost | undefined>;
  listAuthorOutboxRecords(params: {
    authorPrincipalId: string;
    authorCellId: string;
    tenantKey: string;
    postKind?: string;
    limit: number;
  }): Promise<readonly OutboxListedRecord[]>;
  deletePostOutboxRecord(postId: string): Promise<boolean>;
};

export type KhoraHostHealthPort = {
  ping(): void;
};

export type KhoraAdminStatsPort = {
  summary(): KhoraAdminStatsSummary;
  cellDetail(cellId: string): KhoraAdminCellDetailResult;
  principalDetail(did: string): KhoraAdminPrincipalDetailResult;
  inactiveMembers(opts?: { inactiveDays?: number }): KhoraAdminInactiveMembersResult;
};
