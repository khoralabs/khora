import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JsonlStore } from "@cfd/memories-stores";
import { resolveMemoriesRoot } from "./memories/persisted-memories.ts";

let serverRef: ReturnType<typeof Bun.serve> | null = null;

export function setNegotiationServerRef(server: ReturnType<typeof Bun.serve>) {
  serverRef = server;
}

export type ThreadDevLog = {
  memoryId: string;
  append: (label: string, text: string) => void;
};

export type RegisteredRun = {
  runId: string;
  store: JsonlStore;
  path: string;
  memoryId: string;
  nextSeq: number;
};

const runs = new Map<string, RegisteredRun>();

function publish(runId: string, payload: string) {
  serverRef?.publish(runId, payload);
}

export function negotiationDevThreadPath(runId: string): string {
  return join(resolveMemoriesRoot(), "negotiation-dev", runId, "thread.jsonl");
}

function nextSourceKey(rec: RegisteredRun, label: string): string {
  const n = rec.nextSeq++;
  const safe = label.replace(/[/\n\r]/g, "_").slice(0, 80);
  return `event/${String(n).padStart(4, "0")}/${safe}`;
}

/**
 * One JsonlStore per run; file path per thread. Call before starting {@link runMatchmakingSession}.
 */
export function registerRun(runId: string): RegisteredRun {
  const path = negotiationDevThreadPath(runId);
  mkdirSync(join(path, ".."), { recursive: true });
  const store = new JsonlStore(path);
  const memoryId = `matchmaking-dev/${runId}`;
  const rec: RegisteredRun = { runId, store, path, memoryId, nextSeq: 0 };
  runs.set(runId, rec);
  return rec;
}

export function getRun(runId: string): RegisteredRun | undefined {
  return runs.get(runId);
}

export function createThreadDevLog(runId: string): ThreadDevLog {
  const rec = getRun(runId);
  if (rec === undefined) {
    throw new Error("unknown run");
  }
  const { store, memoryId } = rec;
  return {
    memoryId,
    append(label, text) {
      const key = nextSourceKey(rec, label);
      store.appendStringEntry(memoryId, key, text);
      const line = { memory_id: memoryId, source_key: key, kind: "string" as const, string: text };
      publish(runId, JSON.stringify({ t: "line" as const, line }));
    },
  };
}

export function appendDoneEvent(runId: string, result: unknown) {
  const rec = getRun(runId);
  if (rec === undefined) {
    return;
  }
  const key = nextSourceKey(rec, "result");
  const text = JSON.stringify(result);
  rec.store.appendStringEntry(rec.memoryId, key, text);
  publish(runId, JSON.stringify({ t: "done" as const, result }));
}

/** Full JSONL file for WebSocket replay (raw lines, JsonlStore-compatible). */
export function readThreadJsonl(runId: string): string {
  const rec = getRun(runId);
  if (rec === undefined) {
    return "";
  }
  try {
    return readFileSync(rec.path, "utf8");
  } catch {
    return "";
  }
}
