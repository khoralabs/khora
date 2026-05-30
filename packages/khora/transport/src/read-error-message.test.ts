import { describe, expect, test } from "bun:test";
import { readErrorMessage } from "./unary-http";

describe("readErrorMessage", () => {
  test("returns JSON error field when present", async () => {
    const res = new Response(JSON.stringify({ error: "bad did" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
    expect(await readErrorMessage(res)).toBe("bad did");
  });

  test("summarizes HTML error pages instead of dumping markup", async () => {
    const res = new Response(
      `<!DOCTYPE html><html><head></head><body><h1>Bad Gateway</h1></body></html>`,
      { status: 502, statusText: "Bad Gateway" },
    );
    expect(await readErrorMessage(res)).toBe("502 Bad Gateway: Bad Gateway");
  });
});
