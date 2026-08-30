import { existsSync } from "node:fs";
import path from "node:path";

export type LitestreamS3Env = {
  bucket: string;
  keyPrefix: string;
  region: string;
  endpoint?: string;
};

export type LitestreamLogLevel = "debug" | "info" | "warn" | "error";

export type LitestreamLogging = {
  level: LitestreamLogLevel;
};

const LITESTREAM_LOG_LEVELS = new Set<LitestreamLogLevel>(["debug", "info", "warn", "error"]);

export function readLitestreamLogLevel(): LitestreamLogLevel {
  const raw = process.env.LITESTREAM_LOG_LEVEL?.trim().toLowerCase();
  if (raw === undefined || raw.length === 0) return "info";
  if (!LITESTREAM_LOG_LEVELS.has(raw as LitestreamLogLevel)) {
    throw new Error("litestream: LITESTREAM_LOG_LEVEL must be debug, info, warn, or error");
  }
  return raw as LitestreamLogLevel;
}

export function readLitestreamLogging(): LitestreamLogging {
  return { level: readLitestreamLogLevel() };
}

export type LitestreamDbEntry =
  | { kind: "file"; path: string; replicaSuffix: string }
  | { kind: "dir"; dir: string; pattern: string; watch: boolean; replicaSuffix: string };

function yamlQuote(s: string): string {
  return JSON.stringify(s);
}

export function isTruthyEnv(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function readLitestreamS3Env(defaultKeyPrefix: string): LitestreamS3Env {
  const bucket = process.env.LITESTREAM_S3_BUCKET?.trim();
  if (bucket === undefined || bucket.length === 0) {
    throw new Error("litestream: LITESTREAM_S3_BUCKET is required when Litestream is enabled");
  }

  const keyPrefix = (process.env.LITESTREAM_S3_KEY_PREFIX?.trim() || defaultKeyPrefix).replace(
    /^\/+/,
    "",
  );
  const region =
    process.env.LITESTREAM_S3_REGION?.trim() || process.env.AWS_REGION?.trim() || "us-east-1";
  const endpoint = process.env.LITESTREAM_S3_ENDPOINT?.trim();

  return {
    bucket,
    keyPrefix,
    region,
    ...(endpoint !== undefined && endpoint.length > 0 ? { endpoint } : {}),
  };
}

export function assertLitestreamCredentials(s3: Pick<LitestreamS3Env, "endpoint">): void {
  if (s3.endpoint === undefined) {
    return;
  }

  const key = process.env.LITESTREAM_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim();
  const secret =
    process.env.LITESTREAM_SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (key === undefined || key.length === 0 || secret === undefined || secret.length === 0) {
    throw new Error(
      "litestream: set LITESTREAM_ACCESS_KEY_ID and LITESTREAM_SECRET_ACCESS_KEY " +
        "(or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) when LITESTREAM_S3_ENDPOINT is set",
    );
  }
}

export function buildLitestreamYaml(
  opts: LitestreamS3Env & { dbs: LitestreamDbEntry[]; logging?: LitestreamLogging },
): string {
  const base = opts.keyPrefix.replace(/\/+$/, "");
  const replicaUrl = (suffix: string) => `s3://${opts.bucket}/${base}/${suffix}`;
  const logging = opts.logging ?? readLitestreamLogging();

  const endpointLine = opts.endpoint !== undefined ? `endpoint: ${yamlQuote(opts.endpoint)}\n` : "";

  const dbLines = opts.dbs
    .map((db) => {
      if (db.kind === "file") {
        return `  - path: ${yamlQuote(db.path)}
    replica:
      url: ${yamlQuote(replicaUrl(db.replicaSuffix))}`;
      }
      return `  - dir: ${yamlQuote(db.dir)}
    pattern: ${yamlQuote(db.pattern)}
    watch: ${db.watch ? "true" : "false"}
    replica:
      url: ${yamlQuote(replicaUrl(db.replicaSuffix))}`;
    })
    .join("\n");

  return `logging:
  level: ${logging.level}
  type: text
  stderr: false
region: ${yamlQuote(opts.region)}
${endpointLine}
dbs:
${dbLines}
`;
}

export function resolveLitestreamBin(appRoot: string): string {
  const binEnv = process.env.LITESTREAM_BIN_PATH?.trim();
  const litestreamBin = binEnv
    ? path.isAbsolute(binEnv)
      ? binEnv
      : path.resolve(process.cwd(), binEnv)
    : path.join(appRoot, ".bin", "litestream");
  if (!existsSync(litestreamBin)) {
    throw new Error(
      `litestream: binary not found at ${litestreamBin}. Run preinstall or ` +
        "bun ./scripts/install-litestream.ts",
    );
  }
  return litestreamBin;
}
