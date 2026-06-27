import { describe, expect, test } from "bun:test";
import { buildCommandHelpTextMap, formatHelp, tryPrintCommandHelp } from "./help-format";
import type { CommandHelp } from "./types";

describe("formatHelp", () => {
  test("includes Interactive and Non-interactive sections", () => {
    const h: CommandHelp = {
      command: "register",
      summary: "sign up",
      wizard: "run without flags",
      args: "--username x",
    };
    const t = formatHelp("vellum", h);
    expect(t).toContain("vellum register");
    expect(t).toContain("Interactive:");
    expect(t).toContain("Non-interactive (flags):");
  });
});

describe("tryPrintCommandHelp", () => {
  test("matches longest prefix", () => {
    const map = buildCommandHelpTextMap(
      [
        { command: "channel", summary: "channel root" },
        { command: "channel create", summary: "create" },
      ],
      "x",
    );
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      expect(tryPrintCommandHelp(["channel", "create"], map)).toBe(true);
      expect(lines.join("\n")).toContain("channel create");
      expect(tryPrintCommandHelp(["channel", "nope"], map)).toBe(true);
      expect(lines.some((l) => l.includes("channel root"))).toBe(true);
      expect(tryPrintCommandHelp(["unknown"], map)).toBe(false);
    } finally {
      console.log = orig;
    }
  });
});
