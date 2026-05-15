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
        type: "object",
        additionalProperties: false,
        required: ["did"],
        properties: {
          did: { type: "string", minLength: 1, description: "did" },
          "display-name": { type: "string", description: "name" },
          bio: { type: "string", description: "bio" },
          "invite-token": { type: "string", description: "invite" },
        },
      },
      readLine,
    );

    expect(out.did).toBe("did:key:test");
    expect(out["display-name"]).toBe("Ada");
    expect(out.bio).toBeUndefined();
    expect(out["invite-token"]).toBeUndefined();
  });
});
