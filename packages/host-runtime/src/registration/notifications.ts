import type { PrincipalId } from "./types";

export type HostNotification = {
  kind: string;
  payload: unknown;
};

/** Persisted inbox row (SQLite id + lifecycle fields). */
export type HostNotificationRow = {
  id: number;
  createdAtMs: number;
  readAtMs: number | null;
  note: HostNotification;
};

/** Host-side queue per principal (e.g. offline delivery). Column storage may label the key `did`. */
export interface NotificationBufferPort {
  /** Idempotent registration slot for notification delivery. */
  ensureRegistered(principalId: PrincipalId): Promise<void>;

  /** Persists notification; returns row id for WebSocket fan-out. */
  enqueue(principalId: PrincipalId, note: HostNotification): Promise<number>;

  dequeueBatch(principalId: PrincipalId, limit?: number): Promise<HostNotification[]>;

  /** Recent rows for WebSocket snapshot / REST (rows are not deleted). */
  listRecent?(principalId: PrincipalId, limit?: number): Promise<HostNotificationRow[]>;

  /** Set read_at_ms for ids (idempotent for already-read rows). */
  markRead?(principalId: PrincipalId, ids: readonly number[]): Promise<void>;
}
