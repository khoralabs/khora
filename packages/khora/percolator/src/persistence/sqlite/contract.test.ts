import { Database } from "bun:sqlite";
import { runPercolatorPersistenceContractTests } from "../core/contract";
import { createPercolatorSqlitePersistence } from "./sqlite";

runPercolatorPersistenceContractTests("sqlite", () =>
  createPercolatorSqlitePersistence(new Database(":memory:")),
);
