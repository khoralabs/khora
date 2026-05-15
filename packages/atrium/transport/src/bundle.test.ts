import { describe, expect, test } from "bun:test";
import { createAtriumTransportBundleFromEnv } from "./bundle.ts";

describe("createAtriumTransportBundleFromEnv", () => {
  test("http default bundles unary + duplex", () => {
    const b = createAtriumTransportBundleFromEnv({
      baseUrl: "http://h/",
      signer: { did: "did:key:x", sign: async () => new Uint8Array(64) },
      env: {},
    });
    expect(b.unary).toBeDefined();
    expect(b.duplex).toBeDefined();
  });

  test("unsupported mode throws", () => {
    expect(() =>
      createAtriumTransportBundleFromEnv({
        baseUrl: "http://h/",
        signer: { did: "did:key:x", sign: async () => new Uint8Array(64) },
        env: { ATRIUM_TRANSPORT: "ipc" },
      }),
    ).toThrow(/ATRIUM_TRANSPORT=ipc/);
  });
});
