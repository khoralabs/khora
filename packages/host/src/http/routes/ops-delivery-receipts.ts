import { KHORA_ERROR_CODE } from "@khoralabs/khora-contracts/http";
import { DeliveryReceiptBadRequest } from "../../receipts";
import { withAdminTokenAuth } from "./admin-token-guard";
import type { HostRouteDeps } from "./deps";
import { jsonError } from "./responses";

export async function handleOpsDeliveryReceipt(
  req: Request,
  url: URL,
  deps: HostRouteDeps,
  postId: string,
  action?: "contains" | "targets",
): Promise<Response> {
  return withAdminTokenAuth(req, deps, async () => {
    try {
      if (action === "contains" && !url.searchParams.get("did")) {
        throw new DeliveryReceiptBadRequest("did is required");
      }
      const result =
        action === "contains"
          ? await deps.ctx.deliveryReceipts.contains(postId, url.searchParams.get("did") ?? "")
          : action === "targets"
            ? await deps.ctx.deliveryReceipts.targets(postId, {
                limit:
                  url.searchParams.get("limit") === null
                    ? undefined
                    : Number(url.searchParams.get("limit")),
                cursor: url.searchParams.get("cursor") ?? undefined,
              })
            : await deps.ctx.deliveryReceipts.summary(postId);
      return result === undefined
        ? jsonError("Delivery receipt not found", 404, KHORA_ERROR_CODE.not_found)
        : Response.json(result);
    } catch (error) {
      if (error instanceof DeliveryReceiptBadRequest) {
        return jsonError(error.message, 400, KHORA_ERROR_CODE.invalid_request);
      }
      throw error;
    }
  });
}
