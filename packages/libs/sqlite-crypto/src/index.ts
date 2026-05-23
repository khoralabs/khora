export {
  assertEncryptionKeys,
  type EncryptionKeyProvider,
  EnvKeyProvider,
  KmsEnvelopeKeyProvider,
  type SqlCipherScope,
  SqliteCryptoError,
} from "./key-provider.ts";
export {
  applyTestEncryptionEnv,
  createTestEncryptionMaterial,
  createTestOutboxPayloadCodec,
  TEST_ATRIUM_SQLCIPHER_KEY,
  TEST_OUTBOX_KEY_HEX,
  TEST_POST_AUTHOR_SIGNATURE,
  TEST_REGISTRY_SQLCIPHER_KEY,
  TestKeyProvider,
  type TestEncryptionMaterial,
} from "./test-keys.ts";
export {
  createOutboxPayloadCodec,
  decryptOutboxPayload,
  encryptOutboxPayload,
  isOutboxEncryptedPayload,
  OUTBOX_ENVELOPE_ALG,
  OUTBOX_ENVELOPE_MAGIC,
  OUTBOX_ENVELOPE_V1,
  type OutboxEnvelopeV1,
  type OutboxPayloadCodec,
  outboxKeyBytesToHex,
  outboxMetadataIsPost,
} from "./outbox-payload.ts";
export {
  type OpenEncryptedDatabaseOptions,
  openEncryptedDatabase,
  openEncryptedDatabaseSync,
  resolveSqlCipherLib,
  SQLCIPHER_CUSTOM_LIB_ENV,
} from "./sqlcipher.ts";
