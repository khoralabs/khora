import { describe, expect, test } from "bun:test";
import { createKhoraCliContext } from "../flows/context";
import { dispatch } from "./handlers";

describe("dispatch", () => {
  test("runs version command", async () => {
    const ctx = createKhoraCliContext();
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    try {
      await dispatch(ctx, ["version"], {});
      expect(logs).toEqual(["0.0.0"]);
    } finally {
      console.log = orig;
      ctx.closeReadline();
    }
  });

  test("throws on unknown command", async () => {
    const ctx = createKhoraCliContext();
    try {
      await expect(dispatch(ctx, ["nope"], {})).rejects.toThrow("Unknown command: nope");
    } finally {
      ctx.closeReadline();
    }
  });
});
