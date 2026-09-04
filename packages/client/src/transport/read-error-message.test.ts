import { describe, expect, test } from "bun:test";
import { KhoraClientError } from "./errors";
import { readErrorEnvelope, readErrorMessage } from "./unary-http";

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

describe("readErrorEnvelope", () => {
  test("parses message and code from JSON", async () => {
    const res = new Response(JSON.stringify({ error: "nope", code: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
    expect(await readErrorEnvelope(res)).toEqual({
      message: "nope",
      code: "not_found",
      bodyText: JSON.stringify({ error: "nope", code: "not_found" }),
    });
  });

  test("omits code when absent", async () => {
    const res = new Response(JSON.stringify({ error: "bad" }), { status: 400 });
    const env = await readErrorEnvelope(res);
    expect(env.message).toBe("bad");
    expect(env.code).toBeUndefined();
  });

  test("summarizes HTML bodies", async () => {
    const res = new Response(
      `<!DOCTYPE html><html><head></head><body><h1>Bad Gateway</h1></body></html>`,
      { status: 502, statusText: "Bad Gateway" },
    );
    const env = await readErrorEnvelope(res);
    expect(env.message).toBe("502 Bad Gateway: Bad Gateway");
    expect(env.code).toBeUndefined();
  });
});

describe("KhoraClientError", () => {
  test("preserves optional code", () => {
    const err = new KhoraClientError("x", 404, undefined, "not_found");
    expect(err.code).toBe("not_found");
    expect(err.status).toBe(404);
  });
});
