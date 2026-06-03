import { expect, test } from "bun:test";
import { TestKeyProvider } from "@khoralabs/colonnade-crypto";
import { openRelayCatalogDb } from "./sqlite-setup";

test("openRelayCatalogDb creates relay projections without Colonnade catalog tables", async () => {
  const db = await openRelayCatalogDb(":memory:", new TestKeyProvider());
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all() as { name: string }[];
  const names = tables.map((t) => t.name);
  expect(names).toContain("relay_catalog_projections");
  expect(names).not.toContain("discovery_documents");
  expect(names).not.toContain("catalog_pointers");
  expect(names).toContain("standing_queries");
  db.close();
});
