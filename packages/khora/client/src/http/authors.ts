import {
  type AuthorSubscriptionsSnapshot,
  type SubscriptionPredicate,
  zAuthorSubscriptionsSnapshot,
} from "@khoralabs/khora-contracts";
import type { KhoraUnaryTransport } from "@khoralabs/khora-transport";

export type { AuthorSubscriptionsSnapshot, SubscriptionPredicate };

export async function listAuthorSubscriptions(
  t: KhoraUnaryTransport,
): Promise<AuthorSubscriptionsSnapshot> {
  return t.requestJson("GET", "/v1/authors/subscriptions", {
    parse: zAuthorSubscriptionsSnapshot,
  });
}
