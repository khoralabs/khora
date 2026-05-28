import type { OutboxPayloadCodec } from "@khoralabs/sqlite-crypto";

/** Resolved encryption material for Khora server bootstrap. */
export type KhoraEncryptionContext = {
  readonly sqlCipherKey: string;
  readonly outboxPayloadCodec: OutboxPayloadCodec;
};
