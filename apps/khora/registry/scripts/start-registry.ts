/**
 * When REGISTRY_LITESTREAM is set, runs Litestream for registry.sqlite then the Bun server.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveDistIndex, resolveDistServeCwd } from "@khoralabs/bun-web";
import { registryDatabasePath } from "@khoralabs/users";
import {
  assertLitestreamCredentials,
  buildLitestreamYaml,
  isTruthyEnv,
  readLitestreamS3Env,
  resolveLitestreamBin,
} from "../../../../scripts/litestream-config";

const registryRoot = path.resolve(path.dirname(import.meta.path), "..");
const isProd = process.env.NODE_ENV === "production";
const indexEntry = isProd
  ? resolveDistIndex(registryRoot)
  : path.join(registryRoot, "src", "index.ts");
const serveCwd = isProd ? resolveDistServeCwd(registryRoot) : registryRoot;

async function runServerOnly(): Promise<never> {
  const proc = Bun.spawn(isProd ? ["bun", "index.js"] : ["bun", "run", indexEntry], {
    cwd: serveCwd,
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });
  await proc.exited;
  process.exit(proc.exitCode === 0 ? 0 : (proc.exitCode ?? 1));
}

async function runWithLitestream(): Promise<void> {
  const s3 = readLitestreamS3Env("registry/litestream");
  assertLitestreamCredentials(s3);

  const dbPath = path.resolve(process.cwd(), registryDatabasePath());
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const litestreamBin = resolveLitestreamBin(registryRoot);
  const configPath = path.join(tmpdir(), `litestream-registry-${process.pid}.yml`);
  const yaml = buildLitestreamYaml({
    ...s3,
    dbs: [{ kind: "file", path: dbPath, replicaSuffix: "registry.sqlite" }],
  });
  writeFileSync(configPath, yaml, "utf8");

  const lsProc = Bun.spawn([litestreamBin, "replicate", "-config", configPath], {
    cwd: registryRoot,
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
  });

  const srvProc = Bun.spawn(isProd ? ["bun", "index.js"] : ["bun", "run", indexEntry], {
    cwd: serveCwd,
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

if (isTruthyEnv(process.env.REGISTRY_LITESTREAM)) {
  await runWithLitestream();
} else {
  await runServerOnly();
}
