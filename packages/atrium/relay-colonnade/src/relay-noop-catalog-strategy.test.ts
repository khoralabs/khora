import { expect, test } from "bun:test";
import { openRelayCatalogDb } from "./sqlite-setup.ts";

test("openRelayCatalogDb does not create Colonnade pointer/discovery tables", () => {
  const db = openRelayCatalogDb(":memory:");
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as { name: string }[];
  const names = tables.map((t) => t.name);
  expect(names).toContain("relay_catalog_projections");
  expect(names).toContain("relay_subscription_edges");
  expect(names).not.toContain("catalog_pointers");
  expect(names).not.toContain("discovery_documents");
  expect(names).not.toContain("source_map_rows");
  db.close();
});
