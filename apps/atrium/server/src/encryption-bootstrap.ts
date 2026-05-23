import {
  assertEncryptionKeys,
  createOutboxPayloadCodec,
  EnvKeyProvider,
} from "@khoralabs/sqlite-crypto";
import type { AtriumEncryptionContext } from "./encryption-context.ts";

export async function bootstrapAtriumEncryption(): Promise<AtriumEncryptionContext> {
  const provider = new EnvKeyProvider();
  await assertEncryptionKeys(provider, "atrium");
  const sqlCipherKey = await provider.getSqlCipherKey("atrium");
  const outboxKey = await provider.getOutboxFieldKey();
  const outboxPayloadCodec = createOutboxPayloadCodec(outboxKey);
  return { sqlCipherKey, outboxPayloadCodec };
}
