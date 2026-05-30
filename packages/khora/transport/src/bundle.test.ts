import { describe, expect, test } from "bun:test";
import { createKhoraTransportBundleFromEnv } from "./bundle";

describe("createKhoraTransportBundleFromEnv", () => {
  test("defaults to http bundle", () => {
    const b = createKhoraTransportBundleFromEnv({
      baseUrl: "http://localhost:1",
      signer: { did: "did:web:example" } as never,
      env: {},
    });
    expect(b.unary).toBeDefined();
    expect(b.duplex).toBeDefined();
  });

  test("rejects unknown mode", () => {
    expect(() =>
      createKhoraTransportBundleFromEnv({
        baseUrl: "http://localhost:1",
        signer: { did: "did:web:example" } as never,
        env: { KHORA_TRANSPORT: "ipc" },
      }),
    ).toThrow(/KHORA_TRANSPORT=ipc/);
  });
});
