import type { AtriumPost } from "@khoralabs/atrium-contracts";
import type { CellPersistenceStrategy, OutboxListedRecord } from "@khoralabs/colonnade-persistence";
import type {
  AtriumAdminCellDetailResult,
  AtriumAdminInactiveMembersResult,
  AtriumAdminPrincipalDetailResult,
  AtriumAdminStatsSummary,
} from "./ops/admin-stats-types.ts";

export type {
  AtriumAdminCatalogStats,
  AtriumAdminCellDetail,
  AtriumAdminCellDetailResult,
  AtriumAdminCellShardSummary,
  AtriumAdminCellsSummary,
  AtriumAdminFramesStats,
  AtriumAdminHeartbeatStats,
  AtriumAdminInactiveMember,
  AtriumAdminInactiveMemberReason,
  AtriumAdminInactiveMembersResult,
  AtriumAdminInviteStats,
  AtriumAdminNetworkActivityStats,
  AtriumAdminPrincipalDetail,
  AtriumAdminPrincipalDetailResult,
  AtriumAdminStatsSummary,
  AtriumAdminTeardownStats,
} from "./ops/admin-stats-types.ts";

export type AtriumColonnadeCluster = {
  readonly cellPoolCount: number | undefined;
  resolveCell(cellId: string): CellPersistenceStrategy;
  assignPrincipalToCell(principalId: string): string;
  close(): void;
};

export type PostResolver = {
  resolvePostById(id: string): Promise<AtriumPost | undefined>;
  listAuthorOutboxRecords(params: {
    authorPrincipalId: string;
    authorCellId: string;
    tenantKey: string;
    postKind?: string;
    limit: number;
  }): Promise<readonly OutboxListedRecord[]>;
  deletePostOutboxRecord(postId: string): Promise<boolean>;
};

export type AtriumHostHealthPort = {
  ping(): void;
};

export type AtriumAdminStatsPort = {
  summary(): AtriumAdminStatsSummary;
  cellDetail(cellId: string): AtriumAdminCellDetailResult;
  principalDetail(did: string): AtriumAdminPrincipalDetailResult;
  inactiveMembers(opts?: { inactiveDays?: number }): AtriumAdminInactiveMembersResult;
};
