import { afterEach, describe, expect, mock, test } from "bun:test";
import type { PersistableSigner } from "@khoralabs/did-key-identity";

const lookupProfileByDid = mock(async (_did: string) => null as { did: string } | null);
const dispose = mock(() => {});

mock.module("./khora-client", () => ({
  KhoraClient: class {
    lookupProfileByDid = lookupProfileByDid;
    dispose = dispose;
  },
}));

const { discoverRegisteredHostSlugs } = await import("./discover-registered-hosts");

describe("discoverRegisteredHostSlugs", () => {
  afterEach(() => {
    lookupProfileByDid.mockClear();
    dispose.mockClear();
  });

  const signer = { did: "did:key:alice" } as PersistableSigner;

  test("returns slugs where profile lookup succeeds", async () => {
    lookupProfileByDid.mockImplementation(async () => ({ did: "did:key:alice" }));
    const slugs = await discoverRegisteredHostSlugs(signer, {
      a: { baseUrl: "http://a.example" },
      b: { baseUrl: "http://b.example" },
    });
    expect(slugs).toEqual(["a", "b"]);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  test("honors excludeSlug and suppresses lookup errors", async () => {
    lookupProfileByDid.mockImplementation(async () => {
      throw new Error("unreachable");
    });
    const slugs = await discoverRegisteredHostSlugs(
      signer,
      {
        a: { baseUrl: "http://a.example" },
        skip: { baseUrl: "http://skip.example" },
      },
      "skip",
    );
    expect(slugs).toEqual([]);
    expect(lookupProfileByDid).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
