import { Database } from "bun:sqlite";
import { createTestOutboxPayloadCodec } from "../../crypto";
import { runColonnadePersistenceContractTests } from "../core/contract";
import { SqliteCatalogPersistence } from "./sqlite-catalog-persistence";
import { SqliteCellPersistence } from "./sqlite-cell-persistence";

runColonnadePersistenceContractTests("sqlite", () => {
  const codec = createTestOutboxPayloadCodec();
  const authorCellId = "cell-a";
  const recipientCellId = "cell-b";
  return {
    catalog: new SqliteCatalogPersistence(new Database(":memory:", { create: true })),
    authorCell: new SqliteCellPersistence(
      new Database(":memory:", { create: true }),
      authorCellId,
      { outboxPayloadCodec: codec },
    ),
    recipientCell: new SqliteCellPersistence(
      new Database(":memory:", { create: true }),
      recipientCellId,
      { outboxPayloadCodec: codec },
    ),
    authorCellId,
    recipientCellId,
  };
});
