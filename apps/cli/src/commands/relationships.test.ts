import { describe, expect, test } from "bun:test";
import type { KhoraClient } from "@khoralabs/khora-client";

import { createKhoraCliContext } from "../flows/context";
import { dispatch } from "./handlers";
import { allCommandHelp } from "./help/index";
import { formatRelationshipRow, resolvePeerDid } from "./relationships";

describe("relationships helpers", () => {
  test("formatRelationshipRow", () => {
    expect(
      formatRelationshipRow({
        channelId: "ch1",
        peerDid: "did:key:b",
        role: "creator",
        status: "pending",
        createdAtMs: 1,
      }),
    ).toBe("ch1  pending  creator  did:key:b");
  });

  test("resolvePeerDid keeps DIDs", async () => {
    const client = {
      lookupProfileByUsername: async () => {
        throw new Error("should not lookup");
      },
    } as unknown as KhoraClient;
    await expect(resolvePeerDid(client, "did:key:peer")).resolves.toBe("did:key:peer");
  });

  test("resolvePeerDid resolves username via envelope did", async () => {
    const client = {
      lookupProfileByUsername: async () => ({
        did: "did:key:from-user",
        profile: { id: "p1", username: "bob" },
      }),
    } as unknown as KhoraClient;
    await expect(resolvePeerDid(client, "bob")).resolves.toBe("did:key:from-user");
  });

  test("resolvePeerDid errors when username has no did", async () => {
    const client = {
      lookupProfileByUsername: async () => ({
        profile: { id: "p1", username: "bob" },
      }),
    } as unknown as KhoraClient;
    await expect(resolvePeerDid(client, "bob")).rejects.toThrow(/did not return a DID/);
  });

  test("resolvePeerDid errors when username missing", async () => {
    const client = {
      lookupProfileByUsername: async () => null,
    } as unknown as KhoraClient;
    await expect(resolvePeerDid(client, "ghost")).rejects.toThrow(/No profile found/);
  });
});

describe("relationships dispatch and help", () => {
  test("unknown relationships subcommand", async () => {
    const ctx = createKhoraCliContext();
    try {
      await expect(dispatch(ctx, ["relationships", "nope"], {})).rejects.toThrow(
        "Unknown command: relationships nope",
      );
    } finally {
      ctx.closeReadline();
    }
  });

  test("invite requires --peer", async () => {
    const ctx = createKhoraCliContext();
    try {
      await expect(dispatch(ctx, ["relationships", "invite"], {})).rejects.toThrow(/--peer=/);
    } finally {
      ctx.closeReadline();
    }
  });

  test("accept requires channelId", async () => {
    const ctx = createKhoraCliContext();
    try {
      await expect(dispatch(ctx, ["relationships", "accept"], {})).rejects.toThrow(/channelId/);
    } finally {
      ctx.closeReadline();
    }
  });

  test("help registry includes relationship commands", () => {
    const commands = allCommandHelp.map((h) => h.command);
    expect(commands).toContain("relationships list");
    expect(commands).toContain("relationships invite");
    expect(commands).toContain("relationships accept");
    expect(commands).toContain("relationships decline");
    expect(commands).toContain("relationships revoke");
    expect(commands).toContain("relationships delete");
  });
});
