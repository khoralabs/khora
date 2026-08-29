import { createTestOutboxPayloadCodec } from "../../crypto";
import {
  createInMemoryColonnadeContractHarness,
  runColonnadePersistenceContractTests,
} from "./contract";

runColonnadePersistenceContractTests("in-memory", () =>
  createInMemoryColonnadeContractHarness({
    outboxPayloadCodec: createTestOutboxPayloadCodec(),
  }),
);
