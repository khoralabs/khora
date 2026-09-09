#!/usr/bin/env bun
/**
 * Post-build smoke: host dist ships a runnable SQLite cell worker sidecar
 * and the sqlite bundle references the stable `.js` URL.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TEST_OUTBOX_KEY_HEX } from "../../../packages/colonnade/src/crypto/test-keys.ts";

const hostDist = path.resolve(import.meta.dir, "../../../packages/host/dist");
const sqliteJs = path.join(hostDist, "sqlite.js");
const workerJs = path.join(hostDist, "sqlite-cell-worker.js");

if (!existsSync(sqliteJs)) {
  throw new Error(`host sqlite bundle missing: ${sqliteJs}`);
}
if (!existsSync(workerJs)) {
  throw new Error(`host worker sidecar missing: ${workerJs}`);
}

const sqliteSource = await Bun.file(sqliteJs).text();
if (!sqliteSource.includes('"./sqlite-cell-worker.js"')) {
  throw new Error("dist/sqlite.js must reference ./sqlite-cell-worker.js");
}
if (sqliteSource.includes('"./sqlite-cell-worker.ts"')) {
  throw new Error("dist/sqlite.js must not reference ./sqlite-cell-worker.ts");
}

const dir = mkdtempSync(path.join(tmpdir(), "khora-host-worker-smoke-"));
const dbPath = path.join(dir, "cell.sqlite");

try {
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(pathToFileURL(workerJs).href);
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("sqlite-cell-worker smoke timed out waiting for ready"));
    }, 15_000);
    worker.addEventListener("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    worker.addEventListener("message", (ev: MessageEvent<{ readonly kind?: string }>) => {
      if (ev.data.kind === "ready") {
        clearTimeout(timer);
        worker.terminate();
        resolve();
      }
    });
    worker.postMessage({
      kind: "init",
      cellId: "smoke-cell",
      dbPath,
      outboxKeyHex: TEST_OUTBOX_KEY_HEX,
    });
  });
  console.log("host sqlite worker smoke ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
