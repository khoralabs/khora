/**
 * Production launcher: optional Litestream sidecar, then the HTTP server in-process.
 * Compiled entry for `khora-server` release binaries (`bun build --compile`).
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
} from "../../../scripts/litestream-config";
import { resolveKhoraPersistencePaths, validateEnv } from "../src/env";
import {
  applyPackagedRuntimeDefaults,
  isKhoraPackaged,
  resolvePackageRoot,
  resolvePersistenceCwd,
} from "../src/packaged-runtime";
import { envMemoriesBootstrapConfig, envMemoriesEnabled } from "../src/services/memories";

applyPackagedRuntimeDefaults();

const otelEnv = buildOtelServerEnv({ defaultServiceName: "khora-server" });
for (const [key, value] of Object.entries(otelEnv)) {
  process.env[key] = value;
}

const serverRoot = isKhoraPackaged() ? resolvePackageRoot() : resolvePersistenceCwd();

async function ensurePersistenceDirs(): Promise<void> {
  validateEnv(resolvePersistenceCwd());
  const persistencePaths = resolveKhoraPersistencePaths(process.env, resolvePersistenceCwd());
  const dataDirAbs = persistencePaths.dataDir;
  const cellsAbs = persistencePaths.cellsDir;

  mkdirSync(dataDirAbs, { recursive: true });
  mkdirSync(path.dirname(persistencePaths.hostDbPath), { recursive: true });
  mkdirSync(path.dirname(persistencePaths.authNoncesDbPath), { recursive: true });
  mkdirSync(path.dirname(persistencePaths.percolatorDbPath), { recursive: true });
  mkdirSync(cellsAbs, { recursive: true });
  if (envMemoriesEnabled()) {
    const memoriesConfig = envMemoriesBootstrapConfig(persistencePaths);
    if (memoriesConfig === undefined) {
      throw new Error("Memories bootstrap config missing while KHORA_MEMORIES is enabled");
    }
    mkdirSync(memoriesConfig.memoriesDataDir, { recursive: true });
  }
}

async function startLitestream(): Promise<{
  kill: (sig?: NodeJS.Signals) => void;
  exited: Promise<number>;
}> {
  const s3 = readLitestreamS3Env("khora/litestream");
  assertLitestreamCredentials(s3);
  await ensurePersistenceDirs();

  const persistencePaths = resolveKhoraPersistencePaths(process.env, resolvePersistenceCwd());
  const litestreamBin = resolveLitestreamBin(serverRoot);
  const configPath = path.join(tmpdir(), `litestream-khora-${process.pid}.yml`);
  const yaml = buildLitestreamYaml({
    ...s3,
    dbs: [
      {
        kind: "dir",
        dir: persistencePaths.dataDir,
        pattern: "*.sqlite",
        watch: true,
        replicaSuffix: "data",
      },
      {
        kind: "dir",
        dir: persistencePaths.cellsDir,
        pattern: "*.sqlite",
        watch: true,
        replicaSuffix: "cells",
      },
      {
        kind: "dir",
        dir: persistencePaths.memoriesDataDir,
        pattern: "v1/*/database.db",
        watch: true,
        replicaSuffix: "memories",
      },
    ],
  });
  writeFileSync(configPath, yaml, "utf8");

  const lsProc = Bun.spawn([litestreamBin, "replicate", "-config", configPath], {
    cwd: resolvePersistenceCwd(),
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  return {
    kill(sig: NodeJS.Signals = "SIGTERM") {
      try {
        lsProc.kill(sig);
      } catch {
        /* ignore */
      }
      try {
        rmSync(configPath);
      } catch {
        /* ignore */
      }
    },
    exited: lsProc.exited.then((code) => code ?? 1),
  };
}

async function main(): Promise<void> {
  let litestream: Awaited<ReturnType<typeof startLitestream>> | undefined;
  if (isTruthyEnv(process.env.KHORA_LITESTREAM)) {
    litestream = await startLitestream();
  }

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      litestream?.kill(sig);
    });
  }

  try {
    const { runHttpServer } = await import("../src/run-http-server");
    await runHttpServer();
  } finally {
    litestream?.kill("SIGTERM");
    if (litestream !== undefined) {
      try {
        await litestream.exited;
      } catch {
        /* ignore */
      }
    }
  }
}

await main();
