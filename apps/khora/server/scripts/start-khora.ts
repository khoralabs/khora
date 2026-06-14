/**
 * When KHORA_LITESTREAM is set, runs Litestream (catalog + watched cells dir)
 * then the Bun server. Otherwise runs the server only.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

async function runServerOnly(): Promise<never> {
  const proc = Bun.spawn(["bun", "run", indexEntry], {
    cwd: serverRoot,
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });
  await proc.exited;
  process.exit(proc.exitCode === 0 ? 0 : (proc.exitCode ?? 1));
}

async function runWithLitestream(): Promise<void> {
  const s3 = readLitestreamS3Env("khora/litestream");
  assertLitestreamCredentials(s3);
  validateEnv();

  const persistencePaths = resolveKhoraPersistencePaths(process.env, serverRoot);
  const catalogAbs = path.resolve(process.cwd(), persistencePaths.catalogPath);
  const cellsAbs = path.resolve(process.cwd(), persistencePaths.cellsDir);
  const memoriesConfig = envMemoriesEnabled()
    ? envMemoriesBootstrapConfig(persistencePaths)
    : undefined;
  const memoriesAbs =
    memoriesConfig !== undefined ? path.resolve(process.cwd(), memoriesConfig.dbPath) : undefined;

  mkdirSync(persistencePaths.dataDir, { recursive: true });
  mkdirSync(path.dirname(catalogAbs), { recursive: true });
  mkdirSync(cellsAbs, { recursive: true });
  if (memoriesAbs !== undefined) {
    mkdirSync(path.dirname(memoriesAbs), { recursive: true });
  }

  const litestreamBin = resolveLitestreamBin(serverRoot);
  const configPath = path.join(tmpdir(), `litestream-khora-${process.pid}.yml`);
  const yaml = buildLitestreamYaml({
    ...s3,
    dbs: [
      { kind: "file", path: catalogAbs, replicaSuffix: "catalog.sqlite" },
      ...(memoriesAbs !== undefined
        ? [{ kind: "file" as const, path: memoriesAbs, replicaSuffix: "memories.sqlite" }]
        : []),
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
    env: process.env,
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
