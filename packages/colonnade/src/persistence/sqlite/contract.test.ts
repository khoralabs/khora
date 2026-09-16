import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
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

describe("SQLite cell schema migration", () => {
  test("adds and enforces delivery idempotency on an existing inbox", async () => {
    const db = new Database(":memory:", { create: true });
    db.run(`CREATE TABLE inbox (
      inbox_entry_id TEXT PRIMARY KEY NOT NULL,
      tenant_key TEXT NOT NULL,
      recipient_principal_id TEXT NOT NULL,
      staging BLOB NOT NULL,
      enqueued_at_ms INTEGER NOT NULL,
      correlation_id TEXT NOT NULL
    )`);
    const insertLegacy = db.prepare(
      `INSERT INTO inbox VALUES (?, 'tenant', 'bob', ?, 1, 'shared-correlation')`,
    );
    insertLegacy.run("legacy-1", new Uint8Array());
    insertLegacy.run("legacy-2", new Uint8Array());
    const cell = new SqliteCellPersistence(db, "cell", {
      outboxPayloadCodec: createTestOutboxPayloadCodec(),
    });
    const input = {
      cell_id: "cell",
      tenant_key: "tenant",
      recipient_principal_id: "bob",
      staging: {
        kind: "inline" as const,
        inline: { bytes: new Uint8Array([1]), content_hash: "0".repeat(64) },
      },
      delivery_id: "stable-delivery",
      correlation_id: "correlation",
    };
    const first = await cell.enqueueInboxDelivery(input);
    expect(await cell.enqueueInboxDelivery(input)).toEqual(first);
    expect(
      db.query(`SELECT COUNT(*) AS count FROM inbox WHERE delivery_id = ?`).get(input.delivery_id),
    ).toEqual({ count: 1 });
    expect(db.query(`SELECT COUNT(DISTINCT delivery_id) AS count FROM inbox`).get()).toEqual({
      count: 3,
    });
  });
});
