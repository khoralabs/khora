import {
  type AuthorSubscriptionsSnapshot,
  type SubscriptionPredicate,
  zAuthorSubscriptionsSnapshot,
} from "@khoralabs/khora-contracts";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import type { KhoraUnaryTransport } from "../transport";

export type { AuthorSubscriptionsSnapshot, SubscriptionPredicate };

export async function listAuthorSubscriptions(
  t: KhoraUnaryTransport,
): Promise<AuthorSubscriptionsSnapshot> {
  return t.requestJson("GET", KHORA_HTTP_PATH.authorsSubscriptions, {
    parse: zAuthorSubscriptionsSnapshot,
  });
}
