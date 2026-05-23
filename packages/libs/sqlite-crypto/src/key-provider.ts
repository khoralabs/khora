/** SQLCipher whole-file encryption scope. */
export type SqlCipherScope = "atrium" | "registry";

/**
 * Resolves encryption keys for SQLCipher and outbox field encryption.
 * v1: {@link EnvKeyProvider}. v2: {@link KmsEnvelopeKeyProvider} (stub).
 */
export type EncryptionKeyProvider = {
  getSqlCipherKey(scope: SqlCipherScope): Promise<string>;
  getOutboxFieldKey(): Promise<Uint8Array>;
};

export class SqliteCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqliteCryptoError";
  }
}

const MIN_SQLCIPHER_KEY_LEN = 16;
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

/** Read keys from environment variables. */
export class EnvKeyProvider implements EncryptionKeyProvider {
  static readonly ATRIUM_SQLCIPHER_ENV = "ATRIUM_SQLCIPHER_KEY";
  static readonly REGISTRY_SQLCIPHER_ENV = "REGISTRY_SQLCIPHER_KEY";
  static readonly OUTBOX_ENV = "ATRIUM_OUTBOX_ENCRYPTION_KEY";

  async getSqlCipherKey(scope: SqlCipherScope): Promise<string> {
    const name =
      scope === "atrium"
        ? EnvKeyProvider.ATRIUM_SQLCIPHER_ENV
        : EnvKeyProvider.REGISTRY_SQLCIPHER_ENV;
    const key = readEnvRequired(name);
    if (key.length < MIN_SQLCIPHER_KEY_LEN) {
      throw new SqliteCryptoError(`${name} must be at least ${MIN_SQLCIPHER_KEY_LEN} characters`);
    }
    return key;
  }

  async getOutboxFieldKey(): Promise<Uint8Array> {
    return decodeOutboxKey(readEnvRequired(EnvKeyProvider.OUTBOX_ENV));
  }
}

export async function assertEncryptionKeys(
  provider: EncryptionKeyProvider,
  scope: SqlCipherScope,
): Promise<void> {
  await provider.getSqlCipherKey(scope);
  if (scope === "atrium") {
    await provider.getOutboxFieldKey();
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
}
