import {
  type AuthorSubscriptionsSnapshot,
  zAuthorSubscriptionsSnapshot,
} from "@khoralabs/khora-contracts";
import type { KhoraUnaryTransport } from "@khoralabs/khora-transport";

export type { AuthorSubscriptionsSnapshot };

export async function listAuthorSubscriptions(
  t: KhoraUnaryTransport,
): Promise<AuthorSubscriptionsSnapshot> {
  return t.requestJson("GET", "/v1/authors/subscriptions", {
    parse: zAuthorSubscriptionsSnapshot,
  });
}
