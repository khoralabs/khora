import { Database } from "bun:sqlite";
import { createTestOutboxPayloadCodec } from "../../crypto";
import { runColonnadePersistenceContractTests } from "../core/contract";
import { tursoClientsFromBunSqlite } from "./testing/bun-sqlite-adapter";
import { TursoCatalogPersistence } from "./turso-catalog-persistence";
import { TursoCellPersistence } from "./turso-cell-persistence";

runColonnadePersistenceContractTests("turso-serverless (bun adapter)", async () => {
  const codec = createTestOutboxPayloadCodec();
  const authorCellId = "cell-a";
  const recipientCellId = "cell-b";
  return {
    catalog: await TursoCatalogPersistence.open(
      tursoClientsFromBunSqlite(new Database(":memory:")),
    ),
    authorCell: await TursoCellPersistence.open(
      tursoClientsFromBunSqlite(new Database(":memory:")),
      authorCellId,
      { outboxPayloadCodec: codec },
    ),
    recipientCell: await TursoCellPersistence.open(
      tursoClientsFromBunSqlite(new Database(":memory:")),
      recipientCellId,
      { outboxPayloadCodec: codec },
    ),
    authorCellId,
    recipientCellId,
  };
});
