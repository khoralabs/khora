export {
  assertEncryptionKeys,
  type EncryptionKeyProvider,
  EnvKeyProvider,
  isSqlCipherEnvSet,
  KmsEnvelopeKeyProvider,
  type SqlCipherScope,
  tryGetSqlCipherKey,
} from "./key-provider";
export { openMaybeEncryptedDatabaseSync } from "./open-maybe-encrypted";
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
} from "./outbox-payload";
export {
  applyTestEncryptionEnv,
  createTestEncryptionMaterial,
  createTestOutboxPayloadCodec,
  TEST_KHORA_SQLCIPHER_KEY,
  TEST_OUTBOX_KEY_HEX,
  TEST_POST_AUTHOR_SIGNATURE,
  TEST_REGISTRY_SQLCIPHER_KEY,
  type TestEncryptionMaterial,
  TestKeyProvider,
} from "./test-keys";
