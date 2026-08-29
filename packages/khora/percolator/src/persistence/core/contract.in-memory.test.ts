import { runPercolatorPersistenceContractTests } from "./contract";
import { createInMemoryPercolatorPersistence } from "./in-memory";

runPercolatorPersistenceContractTests("in-memory", () => createInMemoryPercolatorPersistence());
