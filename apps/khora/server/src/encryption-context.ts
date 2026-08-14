import type { OutboxPayloadCodec } from "@khoralabs/colonnade/crypto";

/** Resolved encryption material for Khora server bootstrap. */
export type KhoraEncryptionContext = {
  /** When set, SQLite files use SQLCipher; omit for plaintext. */
  readonly sqlCipherKey?: string;
  readonly outboxPayloadCodec: OutboxPayloadCodec;
};
