import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileSync } from "./index.ts";

describe("createProfileSync", () => {
  test("flush writes versioned JSON atomically", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atrium-profile-sync-"));
    const filePath = join(dir, "state.json");
    const snap = {
      profile: { id: "p1", displayName: "Ada" },
      topicSlugs: ["rust"],
      probes: [],
    };
    const client = {
      did: "did:key:x",
      fetchAgentSync: mock(async () => snap),
      subscribe: mock(() => () => {}),
    };
    const sync = createProfileSync({
      client,
      filePath,
      debounceMs: 0,
    });
    await sync.flush();
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    expect(raw.version).toBe(1);
    expect(raw.did).toBe("did:key:x");
    expect(raw.profile.displayName).toBe("Ada");
    expect(raw.topicSlugs).toEqual(["rust"]);
    rmSync(dir, { recursive: true });
  });

  test("debounced subscribe triggers fetchAgentSync", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atrium-profile-sync-"));
    const filePath = join(dir, "state.json");
    let listener: ((e: import("@cfd/atrium-client").AtriumClientEvent) => void) | undefined;
    const fetchAgentSync = mock(async () => ({
      profile: { id: "p1", displayName: "B" },
      topicSlugs: [],
      probes: [],
    }));
    const client = {
      did: "did:key:x",
      fetchAgentSync,
      subscribe: mock((fn: (e: import("@cfd/atrium-client").AtriumClientEvent) => void) => {
        listener = fn;
        return () => {
          listener = undefined;
        };
      }),
    };
    const sync = createProfileSync({
      client,
      filePath,
      debounceMs: 1,
    });
    sync.start();
    expect(fetchAgentSync).toHaveBeenCalled();
    fetchAgentSync.mockClear();
    listener?.({
      type: "profile:updated",
      did: "did:key:x",
      profile: { id: "p1", displayName: "C" },
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchAgentSync).toHaveBeenCalled();
    sync.stop();
    rmSync(dir, { recursive: true });
  });
});
