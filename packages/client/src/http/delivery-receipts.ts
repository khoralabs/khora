import {
  type DeliveryReceiptContains,
  type DeliveryReceiptSummary,
  type DeliveryReceiptTargetsPage,
  zDeliveryReceiptContains,
  zDeliveryReceiptSummary,
  zDeliveryReceiptTargetsPage,
} from "@khoralabs/khora-contracts";
import { khoraDeliveryReceiptPath } from "@khoralabs/khora-contracts/http";
import type { KhoraUnaryTransport } from "../transport";

const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

export const deliveryReceiptSummary = (
  t: KhoraUnaryTransport,
  token: string,
  postId: string,
): Promise<DeliveryReceiptSummary> =>
  t.requestJson("GET", khoraDeliveryReceiptPath(postId), {
    headers: headers(token),
    parse: zDeliveryReceiptSummary,
  });

export const deliveryReceiptContains = (
  t: KhoraUnaryTransport,
  token: string,
  postId: string,
  did: string,
): Promise<DeliveryReceiptContains> =>
  t.requestJson("GET", `${khoraDeliveryReceiptPath(postId)}/contains`, {
    headers: headers(token),
    query: { did },
    parse: zDeliveryReceiptContains,
  });

export const deliveryReceiptTargets = (
  t: KhoraUnaryTransport,
  token: string,
  postId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<DeliveryReceiptTargetsPage> => {
  const query = {
    ...(opts.limit !== undefined ? { limit: String(opts.limit) } : {}),
    ...(opts.cursor !== undefined ? { cursor: opts.cursor } : {}),
  };
  return t.requestJson("GET", `${khoraDeliveryReceiptPath(postId)}/targets`, {
    headers: headers(token),
    ...(Object.keys(query).length > 0 ? { query } : {}),
    parse: zDeliveryReceiptTargetsPage,
  });
};
