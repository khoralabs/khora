import type { Database } from "bun:sqlite";
import type { PrincipalId } from "@khoralabs/agent-relay";
import { escapeSqlLikeLiteral } from "./catalog-projection-store.ts";

export class RelaySubscriptionEdgeStore {
  private readonly insertStmt;
  private readonly deleteStmt;
  private readonly listSubjectsStmt;
  private readonly listPrincipalsStmt;
  private readonly listSubjectsPrefixStmt;

  constructor(db: Database) {
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO relay_subscription_edges(tenant_key, principal_id, subject, created_at_ms)
       VALUES (?, ?, ?, ?)`,
    );
    this.deleteStmt = db.prepare(
      `DELETE FROM relay_subscription_edges
       WHERE tenant_key = ? AND principal_id = ? AND subject = ?`,
    );
    this.listSubjectsStmt = db.query(
      `SELECT subject FROM relay_subscription_edges
       WHERE tenant_key = ? AND principal_id = ?
       ORDER BY created_at_ms ASC, subject ASC`,
    );
    this.listPrincipalsStmt = db.query(
      `SELECT principal_id FROM relay_subscription_edges
       WHERE tenant_key = ? AND subject = ?
       ORDER BY created_at_ms ASC, principal_id ASC`,
    );
    this.listSubjectsPrefixStmt = db.query(
      `SELECT DISTINCT subject FROM relay_subscription_edges
       WHERE tenant_key = ? AND subject LIKE ? ESCAPE '\\'
       ORDER BY subject ASC`,
    );
  }

  insertEdge(tenantKey: string, principalId: PrincipalId, subject: string, nowMs?: number): void {
    this.insertStmt.run(tenantKey, principalId, subject, nowMs ?? Date.now());
  }

  deleteEdge(tenantKey: string, principalId: PrincipalId, subject: string): void {
    this.deleteStmt.run(tenantKey, principalId, subject);
  }

  listSubjectsForPrincipal(tenantKey: string, principalId: PrincipalId): string[] {
    const rows = this.listSubjectsStmt.all(tenantKey, principalId) as { subject: string }[];
    return rows.map((r) => r.subject);
  }

  listPrincipalsForSubject(
    tenantKey: string,
    subject: string,
    excludePrincipalId?: PrincipalId,
  ): PrincipalId[] {
    const rows = this.listPrincipalsStmt.all(tenantKey, subject) as { principal_id: string }[];
    let list = rows.map((r) => r.principal_id as PrincipalId);
    if (excludePrincipalId !== undefined) {
      list = list.filter((p) => p !== excludePrincipalId);
    }
    return list;
  }

  listSubjectsWithPrefix(tenantKey: string, subjectPrefix: string): string[] {
    const pattern = `${escapeSqlLikeLiteral(subjectPrefix)}%`;
    const rows = this.listSubjectsPrefixStmt.all(tenantKey, pattern) as { subject: string }[];
    return rows.map((r) => r.subject);
  }
}
