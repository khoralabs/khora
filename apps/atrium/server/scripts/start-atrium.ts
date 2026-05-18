/**
 * When ATRIUM_LITESTREAM is set, runs Litestream (catalog + frames + watched cells dir)
 * then the Bun server. Otherwise runs the server only.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  envCatalogPath,
  envCellsDir,
  envFramesDbPath,
  validateEnv,
} from "../src/env.ts";

const serverRoot = path.resolve(path.dirname(import.meta.path), "..");
const indexEntry = path.join(serverRoot, "src", "index.ts");

function litestreamModeEnabled(): boolean {
  const v = process.env.ATRIUM_LITESTREAM?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function yamlQuote(s: string): string {
  return JSON.stringify(s);
}

function requireNonEmpty(name: string): string {
  const v = process.env[name]?.trim();
  if (v === undefined || v.length === 0) {
    throw new Error(`start-atrium: ${name} is required when ATRIUM_LITESTREAM is enabled`);
  }
  return v;
}

function s3Credentials(): void {
  const key =
    process.env.LITESTREAM_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim();
  const secret =
    process.env.LITESTREAM_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (key === undefined || key.length === 0 || secret === undefined || secret.length === 0) {
    throw new Error(
      "start-atrium: set LITESTREAM_ACCESS_KEY_ID and LITESTREAM_SECRET_ACCESS_KEY " +
        "(or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) when ATRIUM_LITESTREAM is enabled",
    );
  }
}

function buildLitestreamYaml(opts: {
  catalogAbs: string;
  framesAbs: string;
  cellsAbs: string;
  bucket: string;
  endpoint: string;
  keyPrefix: string;
}): string {
  const { catalogAbs, framesAbs, cellsAbs, bucket, endpoint, keyPrefix } = opts;
  const base = keyPrefix.replace(/\/+$/, "");
  const replicaPath = (name: string) => `s3://${bucket}/${base}/${name}`;
  return `region: us-east-1
endpoint: ${yamlQuote(endpoint)}

dbs:
  - path: ${yamlQuote(catalogAbs)}
    replica:
      url: ${yamlQuote(replicaPath("catalog.sqlite"))}
  - path: ${yamlQuote(framesAbs)}
    replica:
      url: ${yamlQuote(replicaPath("frames.sqlite"))}
  - dir: ${yamlQuote(cellsAbs)}
    pattern: "*.sqlite"
    watch: true
    replica:
      url: ${yamlQuote(replicaPath("cells"))}
`;
}

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
  s3Credentials();
  validateEnv();

  const endpoint = requireNonEmpty("LITESTREAM_S3_ENDPOINT");
  const bucket = requireNonEmpty("LITESTREAM_S3_BUCKET");
  const keyPrefix = (process.env.LITESTREAM_S3_KEY_PREFIX?.trim() || "atrium/litestream").replace(
    /^\/+/,
    "",
  );

  const catalogAbs = path.resolve(process.cwd(), envCatalogPath());
  const framesAbs = path.resolve(process.cwd(), envFramesDbPath());
  const cellsAbs = path.resolve(process.cwd(), envCellsDir());

  mkdirSync(path.dirname(catalogAbs), { recursive: true });
  mkdirSync(path.dirname(framesAbs), { recursive: true });
  mkdirSync(cellsAbs, { recursive: true });

  const binEnv = process.env.LITESTREAM_BIN_PATH?.trim();
  const litestreamBin = binEnv
    ? path.isAbsolute(binEnv)
      ? binEnv
      : path.resolve(process.cwd(), binEnv)
    : path.join(serverRoot, ".bin", "litestream");
  if (!existsSync(litestreamBin)) {
    throw new Error(
      `start-atrium: Litestream binary not found at ${litestreamBin}. Run: bun run preinstall (from apps/atrium/server) or bun ../../../scripts/install-litestream.ts --output .bin/litestream`,
    );
  }

  const configPath = path.join(tmpdir(), `litestream-atrium-${process.pid}.yml`);
  const yaml = buildLitestreamYaml({
    catalogAbs,
    framesAbs,
    cellsAbs,
    bucket,
    endpoint,
    keyPrefix,
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

if (litestreamModeEnabled()) {
  await runWithLitestream();
} else {
  await runServerOnly();
}
