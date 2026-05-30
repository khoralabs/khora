import { describe, expect, test } from "bun:test";
import type { KhoraHostContext } from "@khoralabs/khora-host";
import type { HostRouteDeps } from "./deps";
import { handleInternalMintInvite } from "./internal-invite";

describe("handleInternalMintInvite", () => {
  test("returns 401 without bearer secret", async () => {
    const prev = process.env.KHORA_INTERNAL_SECRET;
    process.env.KHORA_INTERNAL_SECRET = "test-secret";
    try {
      const deps = {
        ctx: { invitesRepo: undefined } as unknown as KhoraHostContext,
        rateLimiters: {} as HostRouteDeps["rateLimiters"],
        consoleAuth: null,
      };
      const res = await handleInternalMintInvite(
        new Request("http://x/internal/mint-invite"),
        deps,
      );
      expect(res.status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.KHORA_INTERNAL_SECRET;
      else process.env.KHORA_INTERNAL_SECRET = prev;
    }
  });
});
