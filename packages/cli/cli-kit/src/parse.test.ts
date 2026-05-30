import { describe, expect, test } from "bun:test";
import { boolFlag, parseArgv, splitTopics, strFlag } from "./parse";

describe("parseArgv", () => {
  test("recognizes single-letter short flags as booleans", () => {
    const { flags, positional } = parseArgv(["start", "-b"]);
    expect(flags).toEqual({ b: true });
    expect(positional).toEqual(["start"]);
  });

  test("supports multiple short flags scattered with positionals", () => {
    const { flags, positional } = parseArgv(["delete", "abc", "-y", "-f"]);
    expect(flags).toEqual({ y: true, f: true });
    expect(positional).toEqual(["delete", "abc"]);
  });

  test("short flags work alongside long flags", () => {
    const { flags } = parseArgv(["-b", "--config", "/tmp/cfg.json", "--json"]);
    expect(flags).toEqual({ b: true, config: "/tmp/cfg.json", json: true });
  });

  test("boolFlag matches the short alias", () => {
    const { flags } = parseArgv(["start", "-b"]);
    expect(boolFlag(flags, "background", "b")).toBe(true);
  });

  test("multi-letter `-foo` is NOT treated as a short-flag bundle (kept as positional)", () => {
    const { flags, positional } = parseArgv(["-foo"]);
    expect(flags).toEqual({});
    expect(positional).toEqual(["-foo"]);
  });

  test("`--` terminates flag parsing; trailing tokens are positional", () => {
    const { flags, positional } = parseArgv(["-b", "--", "-y", "--apply"]);
    expect(flags).toEqual({ b: true });
    expect(positional).toEqual(["-y", "--apply"]);
  });

  test("long flag with =value form", () => {
    const { flags } = parseArgv(["--config=/tmp/x.json"]);
    expect(strFlag(flags, "config")).toBe("/tmp/x.json");
  });

  test("splitTopics: undefined and empty fall back to undefined", () => {
    expect(splitTopics(undefined)).toBeUndefined();
    expect(splitTopics("")).toBeUndefined();
    expect(splitTopics(" , ,")).toBeUndefined();
  });

  test("splitTopics: trims and filters", () => {
    expect(splitTopics("a, b ,,c")).toEqual(["a", "b", "c"]);
  });
});
