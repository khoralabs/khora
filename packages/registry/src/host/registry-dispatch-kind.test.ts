import { describe, expect, test } from "bun:test";
import { registryDispatchKind } from "./registry-dispatch-kind";

describe("registryDispatchKind", () => {
  test("classifies identity prefixes", () => {
    expect(registryDispatchKind("/api/auth/sign-in")).toBe("identity");
    expect(registryDispatchKind("/v1/device/authorize")).toBe("identity");
    expect(registryDispatchKind("/agent/auth")).toBe("identity");
    expect(registryDispatchKind("/.well-known/oauth-authorization-server")).toBe("identity");
  });

  test("classifies host paths", () => {
    expect(registryDispatchKind("/v1/hosts")).toBe("host");
    expect(registryDispatchKind("/health")).toBe("host");
    expect(registryDispatchKind("/ready")).toBe("host");
  });
});
