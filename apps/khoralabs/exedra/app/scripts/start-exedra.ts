/**
 * When EXEDRA_LITESTREAM is set, runs Litestream (exedra.db) then the Bun server.
 * Otherwise runs the server only.
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
} from "../../../../../scripts/litestream-config";
import { resolveExedraDataDir, resolveExedraDbPath } from "../src/server/db/index";
import { buildOtelServerEnv } from "../src/server/otel-config";

const exedraRoot = path.resolve(path.dirname(import.meta.path), "..");
const indexEntry = path.join(exedraRoot, "src", "index.ts");
const serverEnv = buildOtelServerEnv();

async function runServerOnly(): Promise<never> {
  const proc = Bun.spawn(["bun", indexEntry], {
    cwd: exedraRoot,
    stdio: ["inherit", "inherit", "inherit"],
    env: serverEnv,
  });
  await proc.exited;
  process.exit(proc.exitCode === 0 ? 0 : (proc.exitCode ?? 1));
}

async function runWithLitestream(): Promise<void> {
  const s3 = readLitestreamS3Env("exedra");
  assertLitestreamCredentials(s3);

  const dataDir = path.resolve(process.cwd(), resolveExedraDataDir());
  const exedraDbAbs = path.resolve(process.cwd(), resolveExedraDbPath());

  mkdirSync(dataDir, { recursive: true });

  const litestreamBin = resolveLitestreamBin(exedraRoot);
  const configPath = path.join(tmpdir(), `litestream-exedra-${process.pid}.yml`);
  const yaml = buildLitestreamYaml({
    ...s3,
    dbs: [{ kind: "file", path: exedraDbAbs, replicaSuffix: "litestream/exedra.sqlite" }],
  });
  writeFileSync(configPath, yaml, "utf8");

  const lsProc = Bun.spawn([litestreamBin, "replicate", "-config", configPath], {
    cwd: exedraRoot,
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  const srvProc = Bun.spawn(["bun", indexEntry], {
    cwd: exedraRoot,
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

if (isTruthyEnv(process.env.EXEDRA_LITESTREAM)) {
  await runWithLitestream();
} else {
  await runServerOnly();
}
