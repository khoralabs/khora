import { describe, expect, test } from "bun:test";
import type { AtriumHostContext } from "@khoralabs/atrium-host";
import type { HostRouteDeps } from "./deps.ts";
import {
  handleInternalAdminStatsPrincipal,
  handleInternalAdminStatsSummary,
} from "./internal-admin-stats.ts";

function deps(): HostRouteDeps {
  return {
    ctx: {
      catalogDb: { prepare: () => ({ get: () => ({ c: 0 }), all: () => [] }) },
      tenantKey: "relay",
      cluster: { assignPrincipalToCell: () => "colonnade-shard-0" },
      lookupNormalizedUsernameForPrincipal: () => undefined,
    } as unknown as AtriumHostContext,
    rateLimiters: {} as HostRouteDeps["rateLimiters"],
  };
}

describe("internal admin stats", () => {
  test("summary returns 401 without bearer secret", () => {
    const prev = process.env.ATRIUM_INTERNAL_SECRET;
    process.env.ATRIUM_INTERNAL_SECRET = "test-secret";
    try {
      const res = handleInternalAdminStatsSummary(new Request("http://x/summary"), deps());
      expect(res.status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.ATRIUM_INTERNAL_SECRET;
      else process.env.ATRIUM_INTERNAL_SECRET = prev;
    }
  });

  test("principal returns 401 without bearer secret", () => {
    const prev = process.env.ATRIUM_INTERNAL_SECRET;
    process.env.ATRIUM_INTERNAL_SECRET = "test-secret";
    try {
      const res = handleInternalAdminStatsPrincipal(
        new Request("http://x/principal?did=did:key:abc"),
        new URL("http://x/principal?did=did:key:abc"),
        deps(),
      );
      expect(res.status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.ATRIUM_INTERNAL_SECRET;
      else process.env.ATRIUM_INTERNAL_SECRET = prev;
    }
  });

  test("principal returns 400 when did is missing", async () => {
    const prev = process.env.ATRIUM_INTERNAL_SECRET;
    process.env.ATRIUM_INTERNAL_SECRET = "test-secret";
    try {
      const res = handleInternalAdminStatsPrincipal(
        new Request("http://x/principal", {
          headers: { Authorization: "Bearer test-secret" },
        }),
        new URL("http://x/principal"),
        deps(),
      );
      expect(res.status).toBe(400);
    } finally {
      if (prev === undefined) delete process.env.ATRIUM_INTERNAL_SECRET;
      else process.env.ATRIUM_INTERNAL_SECRET = prev;
    }
  });
});
