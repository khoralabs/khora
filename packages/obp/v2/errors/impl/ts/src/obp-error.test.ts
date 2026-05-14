import { describe, expect, test } from "bun:test";
import { ObpError } from "./obp-error.ts";

describe("ObpError", () => {
  test("code and message", () => {
    const e = new ObpError("VALIDATION", "bad");
    expect(e.code).toBe("VALIDATION");
    expect(e.message).toBe("bad");
    expect(e.name).toBe("ObpError");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ObpError);
  });
});
