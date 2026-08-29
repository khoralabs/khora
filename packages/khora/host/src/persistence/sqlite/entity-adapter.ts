import type { Database } from "bun:sqlite";
import type { HostEntityPersistence, HostEntityUpsert } from "../core/port";
import { parseEntityRow } from "../core/row-map";
import type { ProjectionStore } from "./projection-store";

export { parseEntityRow };

export function createEntityAdapter(
  store: ProjectionStore,
  db: Database,
  tenantKey: string,
  namespace: string,
): HostEntityPersistence {
  return {
    upsert(record: HostEntityUpsert): void {
      const projection = {
        id: record.id,
        memoryId: record.memoryId ?? null,
        bodyJson: record.bodyJson,
        updatedAtMs: Date.now(),
      };
      db.transaction(() => {
        store.upsert({ tenant_key: tenantKey, namespace, entry_key: record.id, projection });
      })();
    },

    getById(id: string) {
      const { found, projection } = store.lookupProjection(tenantKey, namespace, id);
      if (!found) return undefined;
      return parseEntityRow(projection, id);
    },

    deleteById(id: string): void {
      db.transaction(() => {
        store.upsert({
          tenant_key: tenantKey,
          namespace,
          entry_key: id,
          projection: { deleted: true },
        });
      })();
    },
  };
}
