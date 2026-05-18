import { describe, expect, test } from "bun:test";
import { createAtriumTransportBundleFromEnv } from "./bundle.ts";

describe("createAtriumTransportBundleFromEnv", () => {
  test("defaults to http bundle", () => {
    const b = createAtriumTransportBundleFromEnv({
      baseUrl: "http://localhost:1",
      signer: { did: "did:web:example" } as never,
      env: {},
    });
    expect(b.unary).toBeDefined();
    expect(b.duplex).toBeDefined();
  });

  test("rejects unknown mode", () => {
    expect(() =>
      createAtriumTransportBundleFromEnv({
        baseUrl: "http://localhost:1",
        signer: { did: "did:web:example" } as never,
        env: { ATRIUM_TRANSPORT: "ipc" },
      }),
    ).toThrow(/ATRIUM_TRANSPORT=ipc/);
  });
});
