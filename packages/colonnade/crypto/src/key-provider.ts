import {
  EnvSqlCipherKeyProvider,
  type SqlCipherKeyProvider,
  SqliteCryptoError,
} from "@khoralabs/sqlite-crypto";

/** SQLCipher whole-file encryption scope for Khora Host vs registry. */
export type SqlCipherScope = "khora" | "registry";

const SQLCIPHER_ENV_BY_SCOPE: Record<SqlCipherScope, string> = {
  khora: "KHORA_SQLCIPHER_KEY",
  registry: "REGISTRY_SQLCIPHER_KEY",
};

/**
 * Resolves SQLCipher keys and Colonnade outbox field encryption keys.
 * v1: {@link EnvKeyProvider}. v2: {@link KmsEnvelopeKeyProvider} (stub).
 */
export type EncryptionKeyProvider = SqlCipherKeyProvider & {
  getOutboxFieldKey(): Promise<Uint8Array>;
  /** AES-256 key for frame-relay pairing secrets at rest (`rooms.pairing_secret_hex`). */
  getPairingSecretKey(): Promise<Uint8Array>;
};

const MIN_OUTBOX_KEY_BYTES = 32;

function readEnvRequired(name: string): string {
  const v = process.env[name]?.trim();
  if (v === undefined || v.length === 0) {
    throw new SqliteCryptoError(`${name} is required`);
  }
  return v;
}

function decodeOutboxKey(raw: string): Uint8Array {
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  const bytes = new TextEncoder().encode(raw);
  if (bytes.length < MIN_OUTBOX_KEY_BYTES) {
    throw new SqliteCryptoError(
      `${EnvKeyProvider.OUTBOX_ENV}: must be 32-byte hex (64 chars) or UTF-8 string of at least ${MIN_OUTBOX_KEY_BYTES} bytes`,
    );
  }
  return bytes;
}

/** Read Khora Host / registry keys from environment variables. */
export class EnvKeyProvider implements EncryptionKeyProvider {
  static readonly KHORA_SQLCIPHER_ENV = SQLCIPHER_ENV_BY_SCOPE.khora;
  static readonly REGISTRY_SQLCIPHER_ENV = SQLCIPHER_ENV_BY_SCOPE.registry;
  static readonly OUTBOX_ENV = "KHORA_OUTBOX_ENCRYPTION_KEY";
  static readonly PAIRING_SECRET_ENV = "KHORA_PAIRING_SECRET_ENCRYPTION_KEY";

  private readonly sqlCipher = new EnvSqlCipherKeyProvider(SQLCIPHER_ENV_BY_SCOPE);

  async getSqlCipherKey(scope: SqlCipherScope): Promise<string> {
    return this.sqlCipher.getSqlCipherKey(scope);
  }

  async getOutboxFieldKey(): Promise<Uint8Array> {
    return decodeOutboxKey(readEnvRequired(EnvKeyProvider.OUTBOX_ENV));
  }

  async getPairingSecretKey(): Promise<Uint8Array> {
    const dedicated = process.env[EnvKeyProvider.PAIRING_SECRET_ENV]?.trim();
    if (dedicated !== undefined && dedicated.length > 0) {
      return decodeOutboxKey(dedicated);
    }
    return this.getOutboxFieldKey();
  }
}

export async function assertEncryptionKeys(
  provider: EncryptionKeyProvider,
  scope: SqlCipherScope,
): Promise<void> {
  await provider.getSqlCipherKey(scope);
  if (scope === "khora") {
    await provider.getOutboxFieldKey();
    await provider.getPairingSecretKey();
  }
}

/** Future: AWS KMS envelope decryption. Not implemented in v1. */
export class KmsEnvelopeKeyProvider implements EncryptionKeyProvider {
  async getSqlCipherKey(_scope: SqlCipherScope): Promise<string> {
    throw new SqliteCryptoError("KmsEnvelopeKeyProvider is not implemented; use EnvKeyProvider");
  }

  async getOutboxFieldKey(): Promise<Uint8Array> {
    throw new SqliteCryptoError("KmsEnvelopeKeyProvider is not implemented; use EnvKeyProvider");
  }

  async getPairingSecretKey(): Promise<Uint8Array> {
    throw new SqliteCryptoError("KmsEnvelopeKeyProvider is not implemented; use EnvKeyProvider");
  }
}
