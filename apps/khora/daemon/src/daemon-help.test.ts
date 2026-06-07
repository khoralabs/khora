import { describe, expect, test } from "bun:test";
import { printDaemonHelp } from "./daemon-help";

describe("printDaemonHelp", () => {
  test("includes khora-daemon branding for release smoke tests", () => {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      printDaemonHelp();
    } finally {
      console.error = orig;
    }
    expect(lines.join("\n")).toContain("khora-daemon");
  });
});
