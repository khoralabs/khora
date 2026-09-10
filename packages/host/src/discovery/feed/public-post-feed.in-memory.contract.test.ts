import { InMemoryCatalogPersistence } from "@khoralabs/colonnade/persistence";
import {
  createMapBackedPublicPostFeedHarness,
  runPublicPostFeedContractTests,
} from "./public-post-feed.contract";

runPublicPostFeedContractTests("in-memory", () =>
  createMapBackedPublicPostFeedHarness({
    catalog: new InMemoryCatalogPersistence(),
  }),
);
