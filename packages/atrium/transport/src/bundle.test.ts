import { describe, expect, test } from "bun:test";
import { createAt2TransportBundleFromEnv } from "./bundle.ts";

describe("createAt2TransportBundleFromEnv", () => {
  test("defaults to http bundle", () => {
    const b = createAt2TransportBundleFromEnv({
      baseUrl: "http://localhost:1",
      signer: { did: "did:web:example" } as never,
      env: {},
    });
    expect(b.unary).toBeDefined();
    expect(b.duplex).toBeDefined();
  });

  test("rejects unknown mode", () => {
    expect(() =>
      createAt2TransportBundleFromEnv({
        baseUrl: "http://localhost:1",
        signer: { did: "did:web:example" } as never,
        env: { AT2_TRANSPORT: "ipc" },
      }),
    ).toThrow(/AT2_TRANSPORT=ipc/);
  });
});
