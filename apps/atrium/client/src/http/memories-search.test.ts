import { describe, expect, mock, test } from "bun:test";
import { generateAgentIdentity, type PersistableAgentSigner } from "@khoralabs/atrium-auth";
import { AtriumClient } from "../atrium-client.ts";

async function makeSigner(): Promise<PersistableAgentSigner> {
  return generateAgentIdentity();
}

describe("searchMemories HTTP", () => {
  test("POST /v1/memories/search with JSON body", async () => {
    const signer = await makeSigner();
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://h/v1/memories/search");
      expect(init?.method).toBe("POST");
      const parsed = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      expect(parsed.query).toBe("hello");
      expect(parsed.scope).toEqual({ kind: "multi", includes: ["profiles", "posts"] });
      expect(parsed.limit).toBe(10);
      return Response.json([
        {
          memory_key: "mk",
          kind: "node",
          score: 0.5,
          labels: [{ kind: "person", props: { name: "n" } }],
          source_key: "bio",
        },
      ]);
    });
    const c = new AtriumClient({ baseUrl: "http://h", signer, fetch: fetchMock });
    const hits = await c.searchMemories({
      query: "hello",
      scope: { kind: "multi", includes: ["profiles", "posts"] },
      limit: 10,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.memory_key).toBe("mk");
    expect(hits[0]?.source_key).toBe("bio");
  });
});
