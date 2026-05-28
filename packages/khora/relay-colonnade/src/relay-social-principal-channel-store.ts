import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/agent-relay";

export class RelaySocialPrincipalChannelStore {
  private readonly insertStmt;
  private readonly deleteStmt;
  private readonly listStmt;

  constructor(db: Database) {
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO relay_social_principal_channels(tenant_key, principal_id, channel_id)
       VALUES (?, ?, ?)`,
    );
    this.deleteStmt = db.prepare(
      `DELETE FROM relay_social_principal_channels
       WHERE tenant_key = ? AND principal_id = ? AND channel_id = ?`,
    );
    this.listStmt = db.query(
      `SELECT channel_id FROM relay_social_principal_channels
       WHERE tenant_key = ? AND principal_id = ?
       ORDER BY channel_id ASC`,
    );
  }

  insertChannel(tenantKey: string, principalId: PrincipalId, channelId: string): void {
    this.insertStmt.run(tenantKey, principalId, channelId);
  }

  deleteChannel(tenantKey: string, principalId: PrincipalId, channelId: string): void {
    this.deleteStmt.run(tenantKey, principalId, channelId);
  }

  listChannelIds(tenantKey: string, principalId: PrincipalId): string[] {
    const rows = this.listStmt.all(tenantKey, principalId) as { channel_id: string }[];
    return rows.map((r) => r.channel_id);
  }
}
