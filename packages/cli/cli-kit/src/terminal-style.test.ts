import { describe, expect, test } from "bun:test";

describe("terminal-style", () => {
  test("semantic wrappers include original text", async () => {
    const { style } = await import("./terminal-style.ts");
    expect(style.success("ok")).toContain("ok");
    expect(style.error("bad")).toContain("bad");
    expect(style.warn("caution")).toContain("caution");
    expect(style.info("note")).toContain("note");
    expect(style.muted("dim")).toContain("dim");
    expect(style.bold("hi")).toContain("hi");
  });

  test("symbols expose non-empty strings", async () => {
    const { symbols } = await import("./terminal-style.ts");
    expect(symbols.success.length).toBeGreaterThan(0);
    expect(symbols.error.length).toBeGreaterThan(0);
    expect(symbols.warning.length).toBeGreaterThan(0);
    expect(symbols.info.length).toBeGreaterThan(0);
  });

  test("NO_COLOR yields plain text from style helpers", async () => {
    const prevNo = process.env.NO_COLOR;
    const prevForce = process.env.FORCE_COLOR;
    process.env.NO_COLOR = "1";
    delete process.env.FORCE_COLOR;
    try {
      const { style } = await import(`./terminal-style.ts?t=${Date.now()}&nocolor=1`);
      expect(style.success("x")).toBe("x");
      expect(style.error("x")).toBe("x");
      expect(style.warn("x")).toBe("x");
      expect(style.info("x")).toBe("x");
      expect(style.muted("x")).toBe("x");
      expect(style.bold("x")).toBe("x");
    } finally {
      if (prevNo === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = prevNo;
      if (prevForce === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = prevForce;
    }
  });
});
