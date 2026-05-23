import type { OutboxPayloadCodec } from "@khoralabs/sqlite-crypto";

/** Resolved encryption material for Atrium server bootstrap. */
export type AtriumEncryptionContext = {
  readonly sqlCipherKey: string;
  readonly outboxPayloadCodec: OutboxPayloadCodec;
};
