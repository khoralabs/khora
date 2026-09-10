import { Database } from "bun:sqlite";
import { SqliteCatalogPersistence } from "@khoralabs/colonnade/sqlite";
import {
  createMapBackedPublicPostFeedHarness,
  runPublicPostFeedContractTests,
} from "./public-post-feed.contract";

runPublicPostFeedContractTests("sqlite", () =>
  createMapBackedPublicPostFeedHarness({
    catalog: new SqliteCatalogPersistence(new Database(":memory:", { create: true })),
  }),
);
