import type { OutboxPayloadCodec } from "@khoralabs/colonnade/crypto";
import {
  assertEncryptionKeys,
  createOutboxPayloadCodec,
  EnvKeyProvider,
  outboxKeyBytesToHex,
  tryGetSqlCipherKey,
} from "@khoralabs/colonnade/crypto";

/** Resolved encryption material for Khora server bootstrap. */
export type KhoraEncryptionContext = {
  /** When set, SQLite files use SQLCipher; omit for plaintext. */
  readonly sqlCipherKey?: string;
  readonly outboxPayloadCodec: OutboxPayloadCodec;
  readonly outboxKeyHex: string;
};

export async function bootstrapKhoraEncryption(): Promise<KhoraEncryptionContext> {
  const provider = new EnvKeyProvider();
  await assertEncryptionKeys(provider, "khora");
  const sqlCipherKey = await tryGetSqlCipherKey(provider, "khora");
  const outboxKey = await provider.getOutboxFieldKey();
  const outboxPayloadCodec = createOutboxPayloadCodec(outboxKey);
  return {
    sqlCipherKey,
    outboxPayloadCodec,
    outboxKeyHex: outboxKeyBytesToHex(outboxKey),
  };
}
