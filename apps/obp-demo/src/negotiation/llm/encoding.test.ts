import { describe, expect, test } from "bun:test";
import { parsePublicText } from "./encoding.ts";

describe("parsePublicText", () => {
  test("extracts tail after |t=", () => {
    expect(parsePublicText("demo.foo|t=hello world")).toBe("hello world");
  });

  test("returns undefined when no |t=", () => {
    expect(parsePublicText("demo.foo")).toBeUndefined();
  });
});
