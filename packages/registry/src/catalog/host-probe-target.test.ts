import { describe, expect, test } from "bun:test";
import {
  assertSafeHostProbeTarget,
  isBlockedProbeAddress,
  UnsafeHostProbeTargetError,
} from "./host-probe-target";

describe("isBlockedProbeAddress", () => {
  test("allows loopback", () => {
    expect(isBlockedProbeAddress("127.0.0.1")).toBe(false);
    expect(isBlockedProbeAddress("::1")).toBe(false);
  });

  test("blocks private and metadata ranges", () => {
    expect(isBlockedProbeAddress("10.0.0.1")).toBe(true);
    expect(isBlockedProbeAddress("192.168.1.1")).toBe(true);
    expect(isBlockedProbeAddress("172.16.0.1")).toBe(true);
    expect(isBlockedProbeAddress("169.254.169.254")).toBe(true);
  });
});

describe("assertSafeHostProbeTarget", () => {
  test("rejects cloud metadata IP", async () => {
    await expect(assertSafeHostProbeTarget("http://169.254.169.254/latest")).rejects.toBeInstanceOf(
      UnsafeHostProbeTargetError,
    );
  });

  test("allows loopback http", async () => {
    await expect(assertSafeHostProbeTarget("http://127.0.0.1:8788/ready")).resolves.toBeUndefined();
  });
});
