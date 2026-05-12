import { describe, expect, test } from "bun:test";
import { type ConfigShowBundle, formatConfigShow, resolveEditor } from "./config.ts";

describe("resolveEditor", () => {
  test("VISUAL outranks EDITOR", () => {
    expect(resolveEditor({ VISUAL: "code -w", EDITOR: "vim" })).toEqual({
      cmd: "code",
      args: ["-w"],
    });
  });

  test("falls back to EDITOR when VISUAL is unset", () => {
    expect(resolveEditor({ EDITOR: "nvim" })).toEqual({ cmd: "nvim", args: [] });
  });

  test("falls back to vi when both env vars are unset", () => {
    expect(resolveEditor({})).toEqual({ cmd: "vi", args: [] });
  });

  test("tokenizes multi-word commands", () => {
    expect(resolveEditor({ EDITOR: "code --wait --new-window" })).toEqual({
      cmd: "code",
      args: ["--wait", "--new-window"],
    });
  });

  test("trims whitespace and ignores empty tokens", () => {
    expect(resolveEditor({ VISUAL: "  emacs   -nw  " })).toEqual({
      cmd: "emacs",
      args: ["-nw"],
    });
  });

  test("treats whitespace-only env as missing (falls back to vi)", () => {
    expect(resolveEditor({ VISUAL: "   ", EDITOR: "" })).toEqual({ cmd: "vi", args: [] });
  });
});

describe("formatConfigShow", () => {
  const bundleWithSource: ConfigShowBundle = {
    effective: { baseUrl: "https://example.test", plugins: { "inbox-buffer": {} } },
    sourcePath: "/tmp/atrium/config.json",
    extendsChain: ["/tmp/atrium/config.json", "/tmp/atrium/base.json"],
  };

  const bundleNoSource: ConfigShowBundle = {
    effective: { baseUrl: "https://example.test" },
    sourcePath: undefined,
    extendsChain: [],
  };

  test("effective mode renders pretty JSON of the merged config", () => {
    const out = formatConfigShow(bundleWithSource, "effective");
    expect(out).toBe(JSON.stringify(bundleWithSource.effective, null, 2));
  });

  test("effective mode works without a source file", () => {
    const out = formatConfigShow(bundleNoSource, "effective");
    expect(JSON.parse(out)).toEqual(bundleNoSource.effective);
  });

  test("raw mode reads bytes from the source file", () => {
    const reads: string[] = [];
    const out = formatConfigShow(bundleWithSource, "raw", (p) => {
      reads.push(p);
      return "RAW BYTES\n";
    });
    expect(reads).toEqual([bundleWithSource.sourcePath ?? ""]);
    expect(out).toBe("RAW BYTES\n");
  });

  test("raw mode throws when no source file is in use", () => {
    expect(() => formatConfigShow(bundleNoSource, "raw")).toThrow(/no config file is in use/);
  });

  test("source mode prints entry plus extends chain, deduping the entry", () => {
    expect(formatConfigShow(bundleWithSource, "source")).toBe(
      ["/tmp/atrium/config.json", "/tmp/atrium/base.json"].join("\n"),
    );
  });

  test("source mode throws when no source file is in use", () => {
    expect(() => formatConfigShow(bundleNoSource, "source")).toThrow(/no config file is in use/);
  });
});
