import type { OutboxPayloadCodec } from "./outbox-payload.ts";
import { createOutboxPayloadCodec } from "./outbox-payload.ts";
import { EnvKeyProvider, type EncryptionKeyProvider, type SqlCipherScope } from "./key-provider.ts";

export const TEST_ATRIUM_SQLCIPHER_KEY = "test-atrium-sqlcipher-key!!";
export const TEST_REGISTRY_SQLCIPHER_KEY = "test-registry-sqlcipher-key!";
export const TEST_OUTBOX_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function testOutboxKeyBytes(): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(TEST_OUTBOX_KEY_HEX.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Fixed keys for unit/integration tests (not for production). */
export class TestKeyProvider implements EncryptionKeyProvider {
  async getSqlCipherKey(scope: SqlCipherScope): Promise<string> {
    return scope === "atrium" ? TEST_ATRIUM_SQLCIPHER_KEY : TEST_REGISTRY_SQLCIPHER_KEY;
  }

  async getOutboxFieldKey(): Promise<Uint8Array> {
    return testOutboxKeyBytes();
  }
}

export function createTestOutboxPayloadCodec(): OutboxPayloadCodec {
  return createOutboxPayloadCodec(testOutboxKeyBytes());
}

export type TestEncryptionMaterial = {
  readonly sqlCipherKey: string;
  readonly outboxPayloadCodec: OutboxPayloadCodec;
  readonly outboxKeyHex: string;
  readonly provider: TestKeyProvider;
};

export function createTestEncryptionMaterial(): TestEncryptionMaterial {
  const provider = new TestKeyProvider();
  const outboxKey = testOutboxKeyBytes();
  const outboxPayloadCodec = createOutboxPayloadCodec(outboxKey);
  return {
    sqlCipherKey: TEST_ATRIUM_SQLCIPHER_KEY,
    outboxPayloadCodec,
    outboxKeyHex: [...outboxKey].map((b) => b.toString(16).padStart(2, "0")).join(""),
    provider,
  };
}

/** Placeholder content signature for contract/unit tests (not cryptographically valid). */
export const TEST_POST_AUTHOR_SIGNATURE = "dGVzdC1wb3N0LXNln";

/** Apply test encryption env vars (for code paths that read {@link EnvKeyProvider}). */
export function applyTestEncryptionEnv(): void {
  process.env[EnvKeyProvider.ATRIUM_SQLCIPHER_ENV] = TEST_ATRIUM_SQLCIPHER_KEY;
  process.env[EnvKeyProvider.REGISTRY_SQLCIPHER_ENV] = TEST_REGISTRY_SQLCIPHER_KEY;
  process.env[EnvKeyProvider.OUTBOX_ENV] = TEST_OUTBOX_KEY_HEX;
}
