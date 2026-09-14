import type { Database } from "bun:sqlite";
import { NAMESPACE_REG_BY_PRINCIPAL } from "../core/id-conventions";
import type { PrincipalOrdinalPort } from "../core/port";
import { PRINCIPAL_ORDINALS_DDL } from "../core/schema";

const MAX_ORDINAL = 0xffffffff;

export function ensurePrincipalOrdinalsSchema(db: Database): void {
  db.run(PRINCIPAL_ORDINALS_DDL);
}

export function createPrincipalOrdinalPort(db: Database): PrincipalOrdinalPort {
  ensurePrincipalOrdinalsSchema(db);
  const insert = db.prepare("INSERT OR IGNORE INTO principal_ordinals (did) VALUES (?)");
  const byDid = db.query<{ ordinal: number }, [string]>(
    "SELECT ordinal FROM principal_ordinals WHERE did = ?",
  );
  const didByOrdinal = db.query<{ did: string }, [number]>(
    "SELECT did FROM principal_ordinals WHERE ordinal = ?",
  );

  return {
    getOrCreate(did) {
      insert.run(did);
      const ordinal = byDid.get(did)?.ordinal;
      if (ordinal === undefined) throw new Error("failed to allocate principal ordinal");
      if (ordinal > MAX_ORDINAL) throw new Error("principal ordinal space exhausted");
      return ordinal;
    },
    getByDid(did) {
      return byDid.get(did)?.ordinal;
    },
    resolveMany(ordinals) {
      const out = new Map<number, string>();
      for (const ordinal of ordinals) {
        const did = didByOrdinal.get(ordinal)?.did;
        if (did !== undefined) out.set(ordinal, did);
      }
      return out;
    },
    getManyByDid(dids) {
      const out = new Map<string, number>();
      for (const did of dids) {
        const ordinal = byDid.get(did)?.ordinal;
        if (ordinal !== undefined) out.set(did, ordinal);
      }
      return out;
    },
  };
}

export function backfillPrincipalOrdinals(
  db: Database,
  tenantKey: string,
  port: PrincipalOrdinalPort,
): number {
  const dids = db
    .query<{ did: string }, [string, string]>(
      `SELECT entry_key AS did FROM khora_host_projections
       WHERE tenant_key = ? AND namespace = ? ORDER BY entry_key`,
    )
    .all(tenantKey, NAMESPACE_REG_BY_PRINCIPAL);
  let inserted = 0;
  for (const { did } of dids) {
    if (port.getByDid(did) !== undefined) continue;
    port.getOrCreate(did);
    inserted += 1;
  }
  return inserted;
}
