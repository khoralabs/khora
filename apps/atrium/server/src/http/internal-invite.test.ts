import { describe, expect, test } from "bun:test";
import type { AtriumHostContext } from "@khoralabs/atrium-host";
import type { HostRouteDeps } from "./deps.ts";
import { handleInternalMintInvite } from "./internal-invite.ts";

describe("handleInternalMintInvite", () => {
  test("returns 401 without bearer secret", async () => {
    const prev = process.env.ATRIUM_INTERNAL_SECRET;
    process.env.ATRIUM_INTERNAL_SECRET = "test-secret";
    try {
      const deps = {
        ctx: { invitesRepo: undefined } as unknown as AtriumHostContext,
        rateLimiters: {} as HostRouteDeps["rateLimiters"],
        consoleAuth: null,
      };
      const res = await handleInternalMintInvite(
        new Request("http://x/internal/mint-invite"),
        deps,
      );
      expect(res.status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.ATRIUM_INTERNAL_SECRET;
      else process.env.ATRIUM_INTERNAL_SECRET = prev;
    }
  });
});
