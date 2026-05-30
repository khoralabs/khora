import { describe, expect, test } from "bun:test";
import { createKhoraCliContext } from "../flows/context";
import { dispatch } from "./handlers";

describe("dispatch", () => {
  test("throws on unknown command", async () => {
    const ctx = createKhoraCliContext();
    try {
      await expect(dispatch(ctx, ["nope"], {})).rejects.toThrow("Unknown command: nope");
    } finally {
      ctx.closeReadline();
    }
  });
});
