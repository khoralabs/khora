import { describe, expect, test } from "bun:test";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import type { KhoraHostContext } from "../..";
import type { HostRouteDeps } from "./deps";
import { handleOpsDeliveryReceipt } from "./ops-delivery-receipts";

const token = "test-root-token-16chars";
const deps = {
  ctx: {
    deliveryReceipts: {
      summary: async (postId: string) => ({
        jobId: "job",
        postId,
        status: "completed" as const,
        plannedTargetCount: 1,
        routedTargetCount: 1,
        targetCount: 1,
        deliveredCount: 1,
        failedCount: 0,
        receiptsAvailable: true,
      }),
    },
  } as unknown as KhoraHostContext,
  rateLimiters: {} as HostRouteDeps["rateLimiters"],
  adminTokenAuth: createRootTokenAdminAuth({ rootToken: token }),
} as HostRouteDeps;

describe("ops delivery receipts", () => {
  test("requires admin authorization", async () => {
    const url = new URL("http://x/v1/ops/delivery-receipts/post");
    expect(await handleOpsDeliveryReceipt(new Request(url), url, deps, "post")).toHaveProperty(
      "status",
      401,
    );
  });

  test("returns authorized tenant receipt summary", async () => {
    const url = new URL("http://x/v1/ops/delivery-receipts/post");
    const response = await handleOpsDeliveryReceipt(
      new Request(url, { headers: { Authorization: `Bearer ${token}` } }),
      url,
      deps,
      "post",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ postId: "post", receiptsAvailable: true });
  });
});
