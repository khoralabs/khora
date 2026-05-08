import { expect, test } from "bun:test";
import type { IncomingHttpHeaders } from "node:http";
import { parseBearerToken } from "./parse-bearer.ts";

test("parseBearerToken extracts token", () => {
  const headers: IncomingHttpHeaders = { authorization: "Bearer abc.def.ghi" };
  expect(parseBearerToken(headers)).toBe("abc.def.ghi");
});

test("parseBearerToken is case-insensitive scheme", () => {
  const headers: IncomingHttpHeaders = { authorization: "bearer tok" };
  expect(parseBearerToken(headers)).toBe("tok");
});

test("parseBearerToken returns undefined when missing", () => {
  expect(parseBearerToken({})).toBeUndefined();
});

test("parseBearerToken uses first header when array", () => {
  const headers = {
    authorization: ["Bearer x", "ignored"],
  } as unknown as IncomingHttpHeaders;
  expect(parseBearerToken(headers)).toBe("x");
});
