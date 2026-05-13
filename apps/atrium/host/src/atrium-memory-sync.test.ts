import { describe, expect, test } from "bun:test";
import { zAtriumPost, zAtriumProfile } from "@khoralabs/atrium-contracts";
import {
  atriumPostMemoryFieldTexts,
  atriumProfileMemoryFieldTexts,
  buildMultiFieldMergeContent,
} from "./atrium-memory-sync.ts";

describe("atrium memory field indexing", () => {
  test("profile username row uses @handle", () => {
    const profile = zAtriumProfile.parse({
      id: "p1",
      username: "ada",
      displayName: "Ada L.",
      bio: "Builder",
    });
    const fields = atriumProfileMemoryFieldTexts(profile);
    const u = fields.find((f) => f.key === "username");
    expect(u?.text).toBe("@ada");
  });

  test("profile fields split for merge content without embedding", async () => {
    const profile = zAtriumProfile.parse({
      id: "p1",
      username: "bob",
      displayName: "Bob",
    });
    const content = await buildMultiFieldMergeContent(
      undefined,
      atriumProfileMemoryFieldTexts(profile),
    );
    expect(content.map((c) => c.key).sort()).toEqual(["displayName", "username"].sort());
    expect(content.find((c) => c.key === "username")?.text).toBe("@bob");
    expect(content.every((c) => c.vector === undefined)).toBe(true);
  });

  test("post fields include title topics body", async () => {
    const post = zAtriumPost.parse({
      id: "post1",
      authorProfileId: "p1",
      kind: "post",
      title: "Hi",
      topics: ["rust", "bun"],
      body: "Hello world",
    });
    const fields = atriumPostMemoryFieldTexts(post);
    expect(fields.find((f) => f.key === "topics")?.text).toBe("#rust #bun");
    const content = await buildMultiFieldMergeContent(undefined, fields);
    expect(new Set(content.map((c) => c.key))).toEqual(new Set(["title", "topics", "body"]));
  });

  test("probe adds matchKinds row", () => {
    const post = zAtriumPost.parse({
      id: "pr1",
      authorProfileId: "p1",
      kind: "probe",
      body: "watch",
      matchPostKinds: ["post", "status"],
    });
    const fields = atriumPostMemoryFieldTexts(post);
    expect(fields.find((f) => f.key === "matchKinds")?.text).toBe("post status");
  });
});
