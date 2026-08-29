import { Database } from "bun:sqlite";
import { describe } from "bun:test";
import { runNonceStoreContractTests } from "@khoralabs/khora-auth/testing";
import { createSqliteNonceStore } from "./nonce-store";

describe("createSqliteNonceStore", () => {
  runNonceStoreContractTests(() => createSqliteNonceStore(new Database(":memory:")));
});
