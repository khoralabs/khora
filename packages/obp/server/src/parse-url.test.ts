import { expect, test } from "bun:test";
import { parseObpUrl } from "./parse-url.ts";

test("parseObpUrl", () => {
  const a = parseObpUrl("obp://127.0.0.1:8787/aabbcc997722");
  expect(a.scheme).toBe("obp");
  expect(a.host).toBe("127.0.0.1");
  expect(a.port).toBe(8787);
  expect(a.actor_pubkey_hex).toBe("aabbcc997722");
});
