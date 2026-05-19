/// <reference lib="webworker" />

import { Database } from "bun:sqlite";

import type { DiscardInboxEntriesInput } from "../cell-persistence-strategy.ts";
import type {
  AckWriteLogAppliedInput,
  AppendOutboxRecordInput,
  AppendWriteLogEntryInput,
  EnqueueInboxDeliveryInput,
  FetchOutboxPayloadInput,
  FetchWriteLogBatchInput,
  ListPendingInboxEntriesInput,
  VerifyAndDrainInboxBatchInput,
} from "../colonnade-types.ts";
import { SqliteCellPersistenceStrategy } from "./sqlite-cell-strategy.ts";

type InitMsg = { readonly kind: "init"; readonly cellId: string; readonly dbPath: string };
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
      return s.deleteOutboxRecord(
        args[0] as import("../colonnade-types.ts").DeleteOutboxRecordInput,
      );
    case "listOutboxRecordsForPrincipal":
      return s.listOutboxRecordsForPrincipal(
        args[0] as import("../colonnade-types.ts").ListOutboxRecordsForPrincipalInput,
      );
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

self.onmessage = (ev: MessageEvent<InitMsg | RpcReq>) => {
  const msg = ev.data;
  if (msg.kind === "init") {
    const db = new Database(msg.dbPath, { create: true });
    strategy = new SqliteCellPersistenceStrategy(db, msg.cellId);
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
