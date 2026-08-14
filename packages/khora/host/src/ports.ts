import type { CellPersistence, OutboxListedRecord } from "@khoralabs/colonnade";
import type {
  EffectiveKhoraHostSpec,
  KhoraHostSpec,
  KhoraHostSpecPatch,
  KhoraPost,
} from "@khoralabs/khora-contracts";
import type {
  KhoraAdminCellDetailResult,
  KhoraAdminInactiveMembersResult,
  KhoraAdminPrincipalDetailResult,
  KhoraAdminStatsSummary,
} from "./ops/admin-stats-types";

export type {
  KhoraAdminCatalogStats,
  KhoraAdminCellDetail,
  KhoraAdminCellDetailResult,
  KhoraAdminCellShardSummary,
  KhoraAdminCellsSummary,
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
} from "./ops/admin-stats-types";

export type KhoraColonnadeCluster = {
  readonly cellPoolCount: number | undefined;
  resolveCell(cellId: string): CellPersistence;
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

export type KhoraHostSpecPort = {
  read(): KhoraHostSpec | null;
  readEffective(): EffectiveKhoraHostSpec;
  patch(patch: KhoraHostSpecPatch): KhoraHostSpec;
  storeSecrets(secrets: { registrationSecret?: string; managementToken?: string }): KhoraHostSpec;
  clearRegistrationSecret(): KhoraHostSpec;
};

export type KhoraAdminStatsPort = {
  summary(): KhoraAdminStatsSummary;
  registeredPrincipalCount(): number;
  cellDetail(cellId: string): KhoraAdminCellDetailResult;
  principalDetail(did: string): KhoraAdminPrincipalDetailResult;
  inactiveMembers(opts?: { inactiveDays?: number }): KhoraAdminInactiveMembersResult;
};
