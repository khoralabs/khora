import { describe, expect, test } from "bun:test";
import { readBindPolicyInteractive } from "./bind-readline.ts";

describe("readBindPolicyInteractive", () => {
  test("collects text fields and validates", async () => {
    const lines = ["did:key:test", "Ada", "", ""];
    let i = 0;
    const readLine = async (_p: string) => {
      const v = lines[i];
      i += 1;
      return v ?? "";
    };

    const out = await readBindPolicyInteractive(
      {
        version: "1",
        properties: [
          { type: "text", name: "DID", prompt: "did", constraints: { minLength: 1 } },
          { type: "text", name: "Display name", prompt: "name", optional: true },
          { type: "text", name: "Bio", prompt: "bio", optional: true },
          { type: "text", name: "Invite token", prompt: "invite", optional: true },
        ],
      },
      readLine,
    );

    expect(out.did).toBe("did:key:test");
    expect(out["display-name"]).toBe("Ada");
    expect(out.bio).toBeUndefined();
    expect(out["invite-token"]).toBeUndefined();
  });
});
