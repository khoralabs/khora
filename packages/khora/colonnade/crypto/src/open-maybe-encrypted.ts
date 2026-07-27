import { Database, type DatabaseOptions } from "bun:sqlite";
import { openEncryptedDatabaseSync } from "@khoralabs/sqlite-crypto";

function hasSqlCipherKey(sqlCipherKey: string | undefined): sqlCipherKey is string {
  return typeof sqlCipherKey === "string" && sqlCipherKey.length > 0;
}

/**
 * Open a Bun SQLite database. When `sqlCipherKey` is set, use SQLCipher;
 * otherwise open plaintext.
 */
export function openMaybeEncryptedDatabaseSync(
  filename: string,
  options?: DatabaseOptions,
  sqlCipherKey?: string,
): Database {
  if (hasSqlCipherKey(sqlCipherKey)) {
    return openEncryptedDatabaseSync(filename, options ?? {}, sqlCipherKey);
  }
  return new Database(filename, options);
}
