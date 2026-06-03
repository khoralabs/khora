import {
  assertEncryptionKeys,
  createOutboxPayloadCodec,
  EnvKeyProvider,
} from "@khoralabs/colonnade-crypto";
import type { KhoraEncryptionContext } from "./encryption-context";

export async function bootstrapKhoraEncryption(): Promise<KhoraEncryptionContext> {
  const provider = new EnvKeyProvider();
  await assertEncryptionKeys(provider, "khora");
  const sqlCipherKey = await provider.getSqlCipherKey("khora");
  const outboxKey = await provider.getOutboxFieldKey();
  const outboxPayloadCodec = createOutboxPayloadCodec(outboxKey);
  return { sqlCipherKey, outboxPayloadCodec };
}
