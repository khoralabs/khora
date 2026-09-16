import type { Database } from "bun:sqlite";

import { type CellRoute, type CellRouteResolver, decodeCellId } from "../../core";

export class SqliteCellRouteStore implements CellRouteResolver {
  constructor(private readonly db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cell_default_routes (
        slot INTEGER PRIMARY KEY,
        route_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cell_principal_routes (
        principal_id TEXT PRIMARY KEY,
        route_json TEXT NOT NULL
      );
    `);
  }

  setDefaultRoutes(routes: readonly CellRoute[]): void {
    const replace = this.db.prepare(
      "INSERT INTO cell_default_routes(slot, route_json) VALUES (?, ?)",
    );
    this.db.transaction(() => {
      this.db.exec("DELETE FROM cell_default_routes");
      routes.forEach((route, slot) => {
        replace.run(slot, JSON.stringify(route));
      });
    })();
  }

  setPrincipalRoute(principalId: string, route: CellRoute): void {
    this.db
      .prepare(
        `INSERT INTO cell_principal_routes(principal_id, route_json) VALUES (?, ?)
         ON CONFLICT(principal_id) DO UPDATE SET route_json = excluded.route_json`,
      )
      .run(principalId, JSON.stringify(route));
  }

  removePrincipalRoute(principalId: string): void {
    this.db.prepare("DELETE FROM cell_principal_routes WHERE principal_id = ?").run(principalId);
  }

  async resolveMany(logicalCellIds: readonly string[]): Promise<ReadonlyMap<string, CellRoute>> {
    const defaults = this.db
      .query("SELECT route_json FROM cell_default_routes ORDER BY slot")
      .all() as { route_json: string }[];
    const defaultRoutes = defaults.map((row) => JSON.parse(row.route_json) as CellRoute);
    const getOverride = this.db.prepare(
      "SELECT route_json FROM cell_principal_routes WHERE principal_id = ?",
    );
    const result = new Map<string, CellRoute>();
    for (const logicalCellId of logicalCellIds) {
      let principalId: string | undefined;
      try {
        const decoded = decodeCellId(logicalCellId);
        principalId = decoded.kind === "principal" ? decoded.ownerKey : undefined;
      } catch {}
      const row =
        principalId === undefined
          ? undefined
          : (getOverride.get(principalId) as { route_json: string } | undefined | null);
      const route =
        row == null
          ? defaultRoutes[hashString(logicalCellId) % defaultRoutes.length]
          : (JSON.parse(row.route_json) as CellRoute);
      if (route !== undefined) result.set(logicalCellId, route);
    }
    return result;
  }
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
