import { Database } from "bun:sqlite";
import { runPercolatorPersistenceContractTests } from "../core/contract";
import { tursoClientsFromBunSqlite } from "./testing/bun-sqlite-adapter";
import { createPercolatorTursoPersistence } from "./turso";

runPercolatorPersistenceContractTests("turso-serverless (bun adapter)", () =>
  createPercolatorTursoPersistence(tursoClientsFromBunSqlite(new Database(":memory:"))),
);
