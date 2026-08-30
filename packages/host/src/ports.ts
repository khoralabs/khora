import type { OutboxListedRecord } from "@khoralabs/colonnade";
import type { CellPersistence } from "@khoralabs/colonnade/persistence";
import type {
  EffectiveKhoraHostSpec,
  KhoraHostSpec,
  KhoraHostSpecPatch,
  KhoraPost,
} from "@khoralabs/khora-contracts";

export type KhoraColonnadeCluster = {
  /** Topology pin for pointer `cell_pool_count` (always `1` under placement isolation). */
  readonly cellPoolCount: number;
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

/** Population counter used by discovery, registration caps, and ops host config. */
export type KhoraAdminStatsPort = {
  registeredPrincipalCount(): number;
};
