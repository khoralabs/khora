import { describe, expect, test } from "bun:test";
import {
  assertLitestreamCredentials,
  buildLitestreamYaml,
  readLitestreamLogLevel,
} from "./litestream-config";

const fileDb = {
  kind: "file" as const,
  path: "/data/registry.sqlite",
  replicaSuffix: "registry.sqlite",
};

describe("buildLitestreamYaml", () => {
  test("omits endpoint for AWS S3", () => {
    const yaml = buildLitestreamYaml({
      bucket: "khora-backups-prod",
      keyPrefix: "registry/litestream",
      region: "us-west-2",
      dbs: [fileDb],
    });
    expect(yaml).toContain("logging:\n  level: info");
    expect(yaml).toContain('region: "us-west-2"');
    expect(yaml).not.toContain("endpoint:");
    expect(yaml).toContain('url: "s3://khora-backups-prod/registry/litestream/registry.sqlite"');
  });

  test("includes logging level from opts", () => {
    const yaml = buildLitestreamYaml({
      bucket: "khora-backups-prod",
      keyPrefix: "registry/litestream",
      region: "us-west-2",
      logging: { level: "error" },
      dbs: [fileDb],
    });
    expect(yaml).toContain("logging:\n  level: error");
  });

  test("includes endpoint for MinIO", () => {
    const yaml = buildLitestreamYaml({
      bucket: "khora-backups",
      keyPrefix: "khora/litestream",
      region: "us-east-1",
      endpoint: "http://127.0.0.1:9000",
      dbs: [{ kind: "file", path: "/data/catalog.sqlite", replicaSuffix: "catalog.sqlite" }],
    });
    expect(yaml).toContain('endpoint: "http://127.0.0.1:9000"');
    expect(yaml).toContain('url: "s3://khora-backups/khora/litestream/catalog.sqlite"');
  });

  test("requires credentials when custom endpoint is set", () => {
    const prevKey = process.env.LITESTREAM_ACCESS_KEY_ID;
    const prevSecret = process.env.LITESTREAM_SECRET_ACCESS_KEY;
    delete process.env.LITESTREAM_ACCESS_KEY_ID;
    delete process.env.LITESTREAM_SECRET_ACCESS_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    try {
      expect(() => assertLitestreamCredentials({ endpoint: "http://127.0.0.1:9000" })).toThrow(
        /LITESTREAM_S3_ENDPOINT/,
      );
      expect(() => assertLitestreamCredentials({})).not.toThrow();
    } finally {
      if (prevKey !== undefined) process.env.LITESTREAM_ACCESS_KEY_ID = prevKey;
      if (prevSecret !== undefined) process.env.LITESTREAM_SECRET_ACCESS_KEY = prevSecret;
    }
  });

  test("exedra layout replicates app db and watched memories dir", () => {
    const yaml = buildLitestreamYaml({
      bucket: "khora-backups-prod",
      keyPrefix: "exedra/litestream",
      region: "us-east-1",
      dbs: [
        { kind: "file", path: "/data/exedra.db", replicaSuffix: "exedra.sqlite" },
        {
          kind: "dir",
          dir: "/data/memories",
          pattern: "*.db",
          watch: true,
          replicaSuffix: "memories",
        },
      ],
    });
    expect(yaml).toContain('path: "/data/exedra.db"');
    expect(yaml).toContain('url: "s3://khora-backups-prod/exedra/litestream/exedra.sqlite"');
    expect(yaml).toContain('dir: "/data/memories"');
    expect(yaml).toContain('pattern: "*.db"');
    expect(yaml).toContain("watch: true");
    expect(yaml).toContain('url: "s3://khora-backups-prod/exedra/litestream/memories"');
  });

  test("readLitestreamLogLevel reads LITESTREAM_LOG_LEVEL", () => {
    const prev = process.env.LITESTREAM_LOG_LEVEL;
    process.env.LITESTREAM_LOG_LEVEL = "warn";
    try {
      expect(readLitestreamLogLevel()).toBe("warn");
    } finally {
      if (prev === undefined) delete process.env.LITESTREAM_LOG_LEVEL;
      else process.env.LITESTREAM_LOG_LEVEL = prev;
    }
  });
});
