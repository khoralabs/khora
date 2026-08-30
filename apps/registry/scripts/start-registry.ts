/**
 * Production launcher: optional Litestream sidecar, then the HTTP server in-process.
 * Compiled entry for `khora-registry` release binaries (`bun build --compile`).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { registryDatabasePath } from "@khoralabs/khora-registry/sqlite";
import { buildOtelServerEnv } from "@khoralabs/observability/otel-env";
import {
  assertLitestreamCredentials,
  buildLitestreamYaml,
  isTruthyEnv,
  readLitestreamS3Env,
  resolveLitestreamBin,
} from "../../../scripts/litestream-config";
import {
  applyPackagedRuntimeDefaults,
  isKhoraPackaged,
  resolvePackageRoot,
  resolvePersistenceCwd,
} from "../src/packaged-runtime";

applyPackagedRuntimeDefaults();

const otelEnv = buildOtelServerEnv({ defaultServiceName: "khora-registry" });
for (const [key, value] of Object.entries(otelEnv)) {
  process.env[key] = value;
}

const registryRoot = isKhoraPackaged() ? resolvePackageRoot() : resolvePersistenceCwd();

async function ensureRegistryDbDir(): Promise<void> {
  const dbPath = path.resolve(resolvePersistenceCwd(), registryDatabasePath());
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
}

async function startLitestream(): Promise<{
  kill: (sig?: NodeJS.Signals) => void;
  exited: Promise<number>;
}> {
  const s3 = readLitestreamS3Env("registry/litestream");
  assertLitestreamCredentials(s3);
  await ensureRegistryDbDir();

  const dbPath = path.resolve(resolvePersistenceCwd(), registryDatabasePath());
  const litestreamBin = resolveLitestreamBin(registryRoot);
  const configPath = path.join(tmpdir(), `litestream-registry-${process.pid}.yml`);
  const yaml = buildLitestreamYaml({
    ...s3,
    dbs: [{ kind: "file", path: dbPath, replicaSuffix: "registry.sqlite" }],
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
  if (isTruthyEnv(process.env.REGISTRY_LITESTREAM)) {
    litestream = await startLitestream();
  }

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      litestream?.kill(sig);
    });
  }

  try {
    const { runRegistryServer } = await import("../src/run-registry-server");
    await runRegistryServer();
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
