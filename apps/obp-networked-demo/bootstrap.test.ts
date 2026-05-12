import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyInvite } from "@khoralabs/obp-auth";
import { normalizeSessionInit } from "@khoralabs/obp-core";
import { writeDemoBootstrap } from "./scripts/gen-bootstrap.ts";
import { loadClientBootstrapFile, loadServerBootstrapFile } from "./scripts/load-bootstrap.ts";

test("bootstrap: invite token verifies with server actor hex", async () => {
  const dir = await mkdtemp(join(tmpdir(), "obp-demo-"));
  try {
    const serverPath = join(dir, "server.json");
    const clientPath = join(dir, "client.json");
    await writeDemoBootstrap(serverPath, clientPath);

    const server = await loadServerBootstrapFile(serverPath);
    const client = await loadClientBootstrapFile(clientPath);

    // Server bootstrap has no shared secret — only responder key.
    expect(server).not.toHaveProperty("pairingSecretHex");
    expect(server.responder).toBeDefined();

    // Client carries the server actor hex and invite token.
    expect(typeof client.serverActorHex).toBe("string");
    expect(typeof client.inviteToken).toBe("string");

    // verifyInvite succeeds with the correct server actor hex.
    const verified = await verifyInvite(client.inviteToken, client.serverActorHex);
    expect(verified).toEqual(normalizeSessionInit(client.init));

    // Tampered token returns null.
    expect(await verifyInvite(`${client.inviteToken}x`, client.serverActorHex)).toBeNull();

    // Wrong actor hex returns null.
    expect(await verifyInvite(client.inviteToken, "f".repeat(64))).toBeNull();

    expect(client.parties.length).toBe(2);
  } finally {
    await rm(dir, { recursive: true });
  }
});
