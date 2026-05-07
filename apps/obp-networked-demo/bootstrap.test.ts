import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeDemoBootstrap } from "./scripts/gen-bootstrap.ts";
import { loadBootstrapFile } from "./scripts/load-bootstrap.ts";

test("bootstrap file shape and roundtrip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "obp-demo-"));
  try {
    const p = join(dir, "boot.json");
    await writeDemoBootstrap(p);
    const raw = JSON.parse(await readFile(p, "utf-8")) as {
      parties: unknown[];
      init: { party_ids: unknown[] };
      responder: { privateKey: unknown };
      initiator: { privateKey: unknown };
    };
    expect(raw.parties.length).toBe(2);
    expect(raw.init.party_ids.length).toBe(2);
    expect(raw.responder.privateKey).toBeDefined();
    expect(raw.initiator.privateKey).toBeDefined();

    const b = await loadBootstrapFile(p);
    expect(b.parties.length).toBe(2);
    expect(b.init.actor_pubkeys.length).toBe(2);
  } finally {
    await rm(dir, { recursive: true });
  }
});
