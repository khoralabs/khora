import { runHostPersistenceContractTests } from "./contract";
import { createInMemoryKhoraHostPersistence } from "./in-memory";
import { createInMemoryKhoraInvitesRepo } from "./in-memory-invites";

runHostPersistenceContractTests("in-memory", () => ({
  persistence: createInMemoryKhoraHostPersistence(),
  invites: createInMemoryKhoraInvitesRepo("contract-pepper"),
}));
