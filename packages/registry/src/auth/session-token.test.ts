import { describe, expect, test } from "bun:test";
import { getRegistrySessionCookieHeader } from "./session-token";

describe("getRegistrySessionCookieHeader", () => {
  test("extracts standard session cookie pair", async () => {
    const req = new Request("http://localhost/v1/device/approve", {
      headers: {
        cookie: "foo=bar; better-auth.session_token=signed-value; other=baz",
      },
    });
    expect(getRegistrySessionCookieHeader(req)).toBe("better-auth.session_token=signed-value");
  });

  test("prefers secure session cookie on HTTPS registries", async () => {
    const req = new Request("http://localhost/v1/device/approve", {
      headers: {
        cookie: "better-auth.session_token=legacy; __Secure-better-auth.session_token=signed-value",
      },
    });
    expect(getRegistrySessionCookieHeader(req)).toBe(
      "__Secure-better-auth.session_token=signed-value",
    );
  });

  test("returns null when session cookie missing", async () => {
    const req = new Request("http://localhost/v1/device/approve", {
      headers: { cookie: "foo=bar" },
    });
    expect(getRegistrySessionCookieHeader(req)).toBeNull();
  });
});
