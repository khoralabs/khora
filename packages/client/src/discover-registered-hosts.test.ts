import { describe, expect, mock, test } from "bun:test";
import type { PersistableSigner } from "@khoralabs/did-key-identity";
import { discoverRegisteredHostSlugs } from "./discover-registered-hosts";

describe("discoverRegisteredHostSlugs", () => {
  const signer = { did: "did:key:alice" } as PersistableSigner;

  test("returns slugs where profile lookup succeeds", async () => {
    const dispose = mock(() => {});
    const lookupProfileByDid = mock(async () => ({ did: "did:key:alice" }));
    const slugs = await discoverRegisteredHostSlugs(
      signer,
      {
        a: { baseUrl: "http://a.example" },
        b: { baseUrl: "http://b.example" },
      },
      undefined,
      {
        createClient: () => ({ lookupProfileByDid, dispose }),
      },
    );
    expect(slugs).toEqual(["a", "b"]);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  test("honors excludeSlug and suppresses lookup errors", async () => {
    const dispose = mock(() => {});
    const lookupProfileByDid = mock(async () => {
      throw new Error("unreachable");
    });
    const slugs = await discoverRegisteredHostSlugs(
      signer,
      {
        a: { baseUrl: "http://a.example" },
        skip: { baseUrl: "http://skip.example" },
      },
      "skip",
      {
        createClient: () => ({ lookupProfileByDid, dispose }),
      },
    );
    expect(slugs).toEqual([]);
    expect(lookupProfileByDid).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
