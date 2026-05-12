/**
 * Render a Litestream config YAML from a flat input record.
 *
 * Pure: no fs / env reads. Callers handle environment parsing and the actual
 * file write. Output is the standard `dbs:` form with a single S3 (or
 * S3-compatible) replica, which is what `litestream replicate -config` consumes.
 */

export type LitestreamConfigInput = {
  dbPath: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Replica object-key prefix (e.g. "prod"). Required — keeps multiple envs separated. */
  path: string;
  /** S3 endpoint URL for non-AWS providers (R2, B2, MinIO). Omit for AWS S3. */
  endpoint?: string;
  /** Most S3-compatible providers require this (R2, B2, MinIO). Ignored for AWS S3. */
  forcePathStyle?: boolean;
  /** AWS region. Defaults to "us-east-1" — required by some providers even when ignored. */
  region?: string;
  /** Default "1s". */
  syncInterval?: string;
  /** Default "1h". */
  snapshotInterval?: string;
  /** Default "72h". */
  retention?: string;
};

/** Indent a multi-line block by N spaces (used to nest replica fields under `replicas`). */
function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}

function quote(value: string): string {
  return JSON.stringify(value);
}

export function renderLitestreamConfig(input: LitestreamConfigInput): string {
  const syncInterval = input.syncInterval ?? "1s";
  const snapshotInterval = input.snapshotInterval ?? "1h";
  const retention = input.retention ?? "72h";
  const region = input.region ?? "us-east-1";

  const replicaLines: string[] = [
    `- type: s3`,
    `  bucket: ${quote(input.bucket)}`,
    `  path: ${quote(input.path)}`,
    `  region: ${quote(region)}`,
    `  sync-interval: ${syncInterval}`,
    `  snapshot-interval: ${snapshotInterval}`,
    `  retention: ${retention}`,
  ];
  if (input.endpoint !== undefined && input.endpoint.length > 0) {
    replicaLines.push(`  endpoint: ${quote(input.endpoint)}`);
  }
  if (input.forcePathStyle === true) {
    replicaLines.push(`  force-path-style: true`);
  }

  const dbBlock = [
    `- path: ${quote(input.dbPath)}`,
    `  replicas:`,
    indent(replicaLines.join("\n"), 4),
  ].join("\n");

  return [
    `access-key-id: ${quote(input.accessKeyId)}`,
    `secret-access-key: ${quote(input.secretAccessKey)}`,
    ``,
    `dbs:`,
    indent(dbBlock, 2),
    ``,
  ].join("\n");
}
