/**
 * When KHORA_LITESTREAM is set, runs Litestream (data-dir *.sqlite + cells/) then the Bun server.
 * Otherwise runs the server only.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildOtelServerEnv } from "@khoralabs/observability/otel-env";
import {
  assertLitestreamCredentials,
  buildLitestreamYaml,
  isTruthyEnv,
  readLitestreamS3Env,
  resolveLitestreamBin,
} from "../../../../scripts/litestream-config";
import { resolveKhoraPersistencePaths, validateEnv } from "../src/env";
import { envMemoriesBootstrapConfig, envMemoriesEnabled } from "../src/memories-env";

const serverRoot = path.resolve(path.dirname(import.meta.path), "..");
const indexEntry = path.join(serverRoot, "src", "index.ts");
const serverEnv = buildOtelServerEnv({ defaultServiceName: "khora-server" });

async function runServerOnly(): Promise<never> {
  const proc = Bun.spawn(["bun", "run", indexEntry], {
    cwd: serverRoot,
    stdio: ["inherit", "inherit", "inherit"],
    env: serverEnv,
  });
  await proc.exited;
  process.exit(proc.exitCode === 0 ? 0 : (proc.exitCode ?? 1));
}

async function runWithLitestream(): Promise<void> {
  const s3 = readLitestreamS3Env("khora/litestream");
  assertLitestreamCredentials(s3);
  validateEnv();

  const persistencePaths = resolveKhoraPersistencePaths(process.env, serverRoot);
  const dataDirAbs = path.resolve(process.cwd(), persistencePaths.dataDir);
  const cellsAbs = path.resolve(process.cwd(), persistencePaths.cellsDir);

  mkdirSync(dataDirAbs, { recursive: true });
  mkdirSync(path.dirname(path.resolve(process.cwd(), persistencePaths.hostDbPath)), {
    recursive: true,
  });
  mkdirSync(path.dirname(path.resolve(process.cwd(), persistencePaths.authNoncesDbPath)), {
    recursive: true,
  });
  mkdirSync(path.dirname(path.resolve(process.cwd(), persistencePaths.percolatorDbPath)), {
    recursive: true,
  });
  mkdirSync(cellsAbs, { recursive: true });
  if (envMemoriesEnabled()) {
    const memoriesConfig = envMemoriesBootstrapConfig(persistencePaths);
    if (memoriesConfig === undefined) {
      throw new Error("KHORA_MEMORIES_DB_PATH is required when KHORA_MEMORIES_ENABLED is true");
    }
    mkdirSync(path.dirname(path.resolve(process.cwd(), memoriesConfig.dbPath)), {
      recursive: true,
    });
  }

  const litestreamBin = resolveLitestreamBin(serverRoot);
  const configPath = path.join(tmpdir(), `litestream-khora-${process.pid}.yml`);
  // Watch the data dir for *.sqlite (host / auth nonces / percolator / memories).
  // Cells remain a nested dir scan — Litestream dir entries are non-recursive.
  const yaml = buildLitestreamYaml({
    ...s3,
    dbs: [
      { kind: "dir", dir: dataDirAbs, pattern: "*.sqlite", watch: true, replicaSuffix: "data" },
      { kind: "dir", dir: cellsAbs, pattern: "*.sqlite", watch: true, replicaSuffix: "cells" },
    ],
  });
  writeFileSync(configPath, yaml, "utf8");

  const lsProc = Bun.spawn([litestreamBin, "replicate", "-config", configPath], {
    cwd: serverRoot,
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  const srvProc = Bun.spawn(["bun", "run", indexEntry], {
    cwd: serverRoot,
    stdio: ["inherit", "inherit", "inherit"],
    env: serverEnv,
  });

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      try {
        srvProc.kill(sig);
      } catch {
        /* ignore */
      }
    });
  }

  await srvProc.exited;
  const code = srvProc.exitCode ?? 1;

  try {
    lsProc.kill("SIGTERM");
    await lsProc.exited;
  } catch {
    /* ignore */
  }

  try {
    rmSync(configPath);
  } catch {
    /* ignore */
  }

  process.exit(code === 0 ? 0 : code);
}

if (isTruthyEnv(process.env.KHORA_LITESTREAM)) {
  await runWithLitestream();
} else {
  await runServerOnly();
}
