import { describe, expect, test } from "bun:test";
import { renderLitestreamConfig } from "./config.ts";

describe("renderLitestreamConfig", () => {
  test("R2-style: includes endpoint + force-path-style + default intervals", () => {
    const yaml = renderLitestreamConfig({
      dbPath: "/data/atrium.db",
      accessKeyId: "AKIA-FAKE",
      secretAccessKey: "secret-fake",
      bucket: "atrium-db",
      path: "prod",
      endpoint: "https://acc.r2.cloudflarestorage.com",
      forcePathStyle: true,
    });

    expect(yaml).toMatchSnapshot();
  });

  test("plain S3: omits endpoint and force-path-style", () => {
    const yaml = renderLitestreamConfig({
      dbPath: "/data/atrium.db",
      accessKeyId: "AKIA-FAKE",
      secretAccessKey: "secret-fake",
      bucket: "atrium-db",
      path: "prod",
    });

    expect(yaml).not.toContain("endpoint:");
    expect(yaml).not.toContain("force-path-style:");
    expect(yaml).toContain("type: s3");
    expect(yaml).toContain("region:");
  });

  test("custom intervals override defaults", () => {
    const yaml = renderLitestreamConfig({
      dbPath: "/data/atrium.db",
      accessKeyId: "a",
      secretAccessKey: "s",
      bucket: "b",
      path: "p",
      syncInterval: "500ms",
      snapshotInterval: "30m",
      retention: "168h",
    });

    expect(yaml).toContain("sync-interval: 500ms");
    expect(yaml).toContain("snapshot-interval: 30m");
    expect(yaml).toContain("retention: 168h");
  });

  test("secrets and paths are JSON-quoted (no YAML escaping surprises)", () => {
    const yaml = renderLitestreamConfig({
      dbPath: "/data/atrium.db",
      accessKeyId: 'key"with"quotes',
      secretAccessKey: "secret\\with\\backslashes",
      bucket: "b",
      path: "p",
    });

    expect(yaml).toContain('access-key-id: "key\\"with\\"quotes"');
    expect(yaml).toContain('secret-access-key: "secret\\\\with\\\\backslashes"');
  });
});
