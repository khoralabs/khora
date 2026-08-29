import { describe } from "bun:test";
import { createMemoryNonceStore } from "./memory-nonce-store";
import { runNonceStoreContractTests } from "./nonce-store.contract";

describe("createMemoryNonceStore", () => {
  runNonceStoreContractTests(() => createMemoryNonceStore());
});
