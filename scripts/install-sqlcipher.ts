#!/usr/bin/env bun
/**
 * Document / verify SQLCipher availability for Khora encrypted SQLite.
 *
 * Bun must load a SQLCipher-enabled libsqlite3 via Database.setCustomSQLite before
 * any Database() call. Install options:
 *
 *   macOS:  brew install sqlcipher
 *           export SQLCIPHER_CUSTOM_LIB="$(brew --prefix sqlcipher)/lib/libsqlcipher.dylib"
 *
 *   Linux:  install libsqlcipher-dev / sqlcipher package for your distro, then set
 *           SQLCIPHER_CUSTOM_LIB to the shared library path.
 *
 * This script checks whether a SQLCipher library is discoverable (same paths as
 * @khoralabs/sqlite-crypto resolveSqlCipherLib).
 */
import {
  resolveSqlCipherLib,
  SQLCIPHER_CUSTOM_LIB_ENV,
} from "../packages/libs/sqlite-crypto/src/sqlcipher.ts";

console.log(`Checking SQLCipher library (${SQLCIPHER_CUSTOM_LIB_ENV})…`);
try {
  resolveSqlCipherLib();
  console.log("SQLCipher custom library configured (or already loaded).");
  console.log("Set KHORA_SQLCIPHER_KEY / REGISTRY_SQLCIPHER_KEY to enable encrypted DB files.");
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
