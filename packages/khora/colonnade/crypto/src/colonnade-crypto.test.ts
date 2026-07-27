import { describe, expect, test } from "bun:test";
import { EnvKeyProvider, tryGetSqlCipherKey } from "./key-provider";
import { openMaybeEncryptedDatabaseSync } from "./open-maybe-encrypted";
import {
  createOutboxPayloadCodec,
  decryptOutboxPayload,
  encryptOutboxPayload,
  isOutboxEncryptedPayload,
  outboxMetadataIsPost,
} from "./outbox-payload";

const TEST_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function keyBytes(): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(TEST_KEY_HEX.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe("outbox-payload", () => {
  test("round-trip encrypt/decrypt", async () => {
    const pt = new TextEncoder().encode('{"body":"hello"}');
    const ct = await encryptOutboxPayload(pt, keyBytes());
    expect(isOutboxEncryptedPayload(ct)).toBe(true);
    const back = await decryptOutboxPayload(ct, keyBytes());
    expect(new TextDecoder().decode(back)).toBe('{"body":"hello"}');
  });

  test("non-encrypted payload rejects decrypt", async () => {
    const pt = new TextEncoder().encode('{"body":"plain"}');
    await expect(decryptOutboxPayload(pt, keyBytes())).rejects.toThrow(
      "outbox payload is not encrypted",
    );
  });

  test("codec encrypts post metadata only", async () => {
    const codec = createOutboxPayloadCodec(keyBytes());
    const pt = new TextEncoder().encode("{}");
    const postCt = await codec.encryptIfPost({ postId: "atp0:x" }, pt);
    expect(isOutboxEncryptedPayload(postCt)).toBe(true);
    const plain = await codec.encryptIfPost({ other: true }, pt);
    expect(plain).toBe(pt);
  });

  test("outboxMetadataIsPost", () => {
    expect(outboxMetadataIsPost({ postId: "x" })).toBe(true);
    expect(outboxMetadataIsPost({})).toBe(false);
  });
});

describe("EnvKeyProvider", () => {
  test("reads hex outbox key", async () => {
    const prev = process.env.KHORA_OUTBOX_ENCRYPTION_KEY;
    process.env.KHORA_OUTBOX_ENCRYPTION_KEY = TEST_KEY_HEX;
    try {
      const k = await new EnvKeyProvider().getOutboxFieldKey();
      expect(k?.length).toBe(32);
    } finally {
      if (prev === undefined) delete process.env.KHORA_OUTBOX_ENCRYPTION_KEY;
      else process.env.KHORA_OUTBOX_ENCRYPTION_KEY = prev;
    }
  });
});

describe("SQLCipher opt-in", () => {
  test("tryGetSqlCipherKey returns undefined when env unset", async () => {
    const prev = process.env.KHORA_SQLCIPHER_KEY;
    delete process.env.KHORA_SQLCIPHER_KEY;
    try {
      const key = await tryGetSqlCipherKey(new EnvKeyProvider(), "khora");
      expect(key).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.KHORA_SQLCIPHER_KEY;
      else process.env.KHORA_SQLCIPHER_KEY = prev;
    }
  });

  test("openMaybeEncryptedDatabaseSync opens plaintext without key", () => {
    const db = openMaybeEncryptedDatabaseSync(":memory:", { create: true });
    try {
      db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      db.run("INSERT INTO t (id) VALUES (1)");
      const row = db.query("SELECT id FROM t").get() as { id: number };
      expect(row.id).toBe(1);
    } finally {
      db.close();
    }
  });
});
