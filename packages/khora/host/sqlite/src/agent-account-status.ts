import type { Database } from "bun:sqlite";
import type { AgentAccountStatus, AgentAccountStatusPort } from "@khoralabs/khora-host";

export function createAgentAccountStatusPort(db: Database): AgentAccountStatusPort {
  return {
    getStatus(did: string): AgentAccountStatus | undefined {
      const row = db.prepare(`SELECT status FROM agent_account_status WHERE did = ?`).get(did) as
        | { status: AgentAccountStatus }
        | undefined;
      return row?.status;
    },
    setStatus(did: string, status: AgentAccountStatus): void {
      const now = Date.now();
      db.prepare(
        `INSERT INTO agent_account_status (did, status, created_at_ms)
         VALUES (?, ?, ?)
         ON CONFLICT(did) DO UPDATE SET
           status = excluded.status,
           created_at_ms = excluded.created_at_ms`,
      ).run(did, status, now);
    },
    clearStatus(did: string): void {
      db.prepare(`DELETE FROM agent_account_status WHERE did = ?`).run(did);
    },
  };
}
