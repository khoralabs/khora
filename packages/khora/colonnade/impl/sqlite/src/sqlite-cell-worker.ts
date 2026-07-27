/// <reference lib="WebWorker" />
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import {
  createOutboxPayloadCodec,
  openMaybeEncryptedDatabaseSync,
} from "@khoralabs/colonnade-crypto";
import type {
  AckWriteLogAppliedInput,
  AppendOutboxRecordInput,
  AppendWriteLogEntryInput,
  DeleteOutboxRecordInput,
  DiscardInboxEntriesInput,
  EnqueueInboxDeliveryInput,
  FetchOutboxPayloadInput,
  FetchWriteLogBatchInput,
  ListOutboxRecordsForPrincipalInput,
  ListPendingInboxEntriesInput,
  VerifyAndDrainInboxBatchInput,
} from "@khoralabs/colonnade-persistence";
import { SqliteCellPersistenceStrategy } from "./sqlite-cell-strategy";

type InitMsg = {
  readonly kind: "init";
  readonly cellId: string;
  readonly dbPath: string;
  readonly sqlCipherKey?: string;
  readonly outboxKeyHex: string;
};
type RpcReq = {
  readonly kind: "rpc";
  readonly id: number;
  readonly method: string;
  readonly args: readonly unknown[];
};
type RpcOk = { readonly kind: "rpc_ok"; readonly id: number; readonly result: unknown };
type RpcErr = { readonly kind: "rpc_err"; readonly id: number; readonly error: string };
type ReadyMsg = { readonly kind: "ready" };

let strategy: SqliteCellPersistenceStrategy | undefined;

declare const self: DedicatedWorkerGlobalScope;

function softenSetCustomSqlite(): void {
  const original = Database.setCustomSQLite.bind(Database);
  Database.setCustomSQLite = ((path: string) => {
    try {
      original(path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/SQLite already loaded/i.test(msg)) throw e;
    }
  }) as typeof Database.setCustomSQLite;
}

/** Avoid `brew` from sqlite-crypto — `execFileSync("brew")` can hang in Bun Workers. */
function ensureSqlCipherEnv(): void {
  if (process.env.SQLCIPHER_CUSTOM_LIB?.trim()) return;
  for (const p of [
    "/opt/homebrew/opt/sqlcipher/lib/libsqlcipher.dylib",
    "/usr/local/opt/sqlcipher/lib/libsqlcipher.dylib",
    "/usr/lib/x86_64-linux-gnu/libsqlcipher.so.0",
    "/usr/lib/aarch64-linux-gnu/libsqlcipher.so.0",
  ]) {
    if (existsSync(p)) {
      process.env.SQLCIPHER_CUSTOM_LIB = p;
      return;
    }
  }
}

async function dispatch(method: string, args: readonly unknown[]): Promise<unknown> {
  const s = strategy;
  if (s === undefined) {
    throw new Error("sqlite-cell-worker: not initialized");
  }
  switch (method) {
    case "appendOutboxRecord":
      return s.appendOutboxRecord(args[0] as AppendOutboxRecordInput);
    case "enqueueInboxDelivery":
      return s.enqueueInboxDelivery(args[0] as EnqueueInboxDeliveryInput);
    case "enqueueInboxDeliveriesBatch":
      return s.enqueueInboxDeliveriesBatch(args[0] as readonly EnqueueInboxDeliveryInput[]);
    case "listPendingInboxEntries":
      return s.listPendingInboxEntries(args[0] as ListPendingInboxEntriesInput);
    case "fetchOutboxPayload":
      return s.fetchOutboxPayload(args[0] as FetchOutboxPayloadInput);
    case "deleteOutboxRecord":
      return s.deleteOutboxRecord(args[0] as DeleteOutboxRecordInput);
    case "listOutboxRecordsForPrincipal":
      return s.listOutboxRecordsForPrincipal(args[0] as ListOutboxRecordsForPrincipalInput);
    case "verifyAndDrainInboxBatch":
      return s.verifyAndDrainInboxBatch(args[0] as VerifyAndDrainInboxBatchInput);
    case "appendWriteLogEntry":
      return s.appendWriteLogEntry(args[0] as AppendWriteLogEntryInput);
    case "appendWriteLogEntriesBatch":
      return s.appendWriteLogEntriesBatch(args[0] as readonly AppendWriteLogEntryInput[]);
    case "fetchWriteLogBatch":
      return s.fetchWriteLogBatch(args[0] as FetchWriteLogBatchInput);
    case "ackWriteLogApplied":
      return s.ackWriteLogApplied(args[0] as AckWriteLogAppliedInput);
    case "purgePrincipal":
      return s.purgePrincipal(args[0] as string);
    case "discardInboxEntries":
      return s.discardInboxEntries(args[0] as DiscardInboxEntriesInput);
    default:
      throw new Error(`sqlite-cell-worker: unknown method ${method}`);
  }
}

function outboxCodecFromHex(outboxKeyHex: string) {
  if (outboxKeyHex.length !== 64) {
    throw new Error("sqlite-cell-worker: outboxKeyHex must be 64 hex chars");
  }
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = Number.parseInt(outboxKeyHex.slice(i * 2, i * 2 + 2), 16);
  }
  return createOutboxPayloadCodec(keyBytes);
}

self.onmessage = (ev: MessageEvent<InitMsg | RpcReq>) => {
  const msg = ev.data;
  if (msg.kind === "init") {
    // Catalog / preload may already load process-global SQLite before this worker runs.
    softenSetCustomSqlite();
    if (typeof msg.sqlCipherKey === "string" && msg.sqlCipherKey.length > 0) {
      ensureSqlCipherEnv();
    }
    const db = openMaybeEncryptedDatabaseSync(msg.dbPath, { create: true }, msg.sqlCipherKey);
    const outboxPayloadCodec = outboxCodecFromHex(msg.outboxKeyHex);
    strategy = new SqliteCellPersistenceStrategy(db, msg.cellId, { outboxPayloadCodec });
    const ready: ReadyMsg = { kind: "ready" };
    self.postMessage(ready);
    return;
  }
  if (msg.kind !== "rpc") {
    return;
  }
  void (async () => {
    try {
      const result = await dispatch(msg.method, msg.args);
      const out: RpcOk = { kind: "rpc_ok", id: msg.id, result };
      self.postMessage(out);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const out: RpcErr = { kind: "rpc_err", id: msg.id, error: errMsg };
      self.postMessage(out);
    }
  })();
};
