import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { bumpAppVersions } from "./bump-versions.ts";

describe("bumpAppVersions", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  test("bumps cli and daemon together", () => {
    root = mkdtempSync(path.join(os.tmpdir(), "khora-bump-apps-"));
    for (const rel of ["apps/cli", "apps/daemon"]) {
      mkdirSync(path.join(root, rel), { recursive: true });
      writeFileSync(
        path.join(root, rel, "package.json"),
        `${JSON.stringify({ name: rel, version: "0.0.0" }, null, 2)}\n`,
      );
    }
    bumpAppVersions(root, "cli", "1.2.3");
    expect(
      (
        JSON.parse(readFileSync(path.join(root, "apps/cli/package.json"), "utf8")) as {
          version: string;
        }
      ).version,
    ).toBe("1.2.3");
    expect(
      (
        JSON.parse(readFileSync(path.join(root, "apps/daemon/package.json"), "utf8")) as {
          version: string;
        }
      ).version,
    ).toBe("1.2.3");
  });

  test("bumps server alone", () => {
    root = mkdtempSync(path.join(os.tmpdir(), "khora-bump-server-"));
    mkdirSync(path.join(root, "apps/server"), { recursive: true });
    writeFileSync(
      path.join(root, "apps/server/package.json"),
      `${JSON.stringify({ name: "server", version: "0.0.0" }, null, 2)}\n`,
    );
    bumpAppVersions(root, "server", "2.0.0");
    expect(
      (
        JSON.parse(readFileSync(path.join(root, "apps/server/package.json"), "utf8")) as {
          version: string;
        }
      ).version,
    ).toBe("2.0.0");
  });

  test("bumps registry alone", () => {
    root = mkdtempSync(path.join(os.tmpdir(), "khora-bump-registry-"));
    mkdirSync(path.join(root, "apps/registry"), { recursive: true });
    writeFileSync(
      path.join(root, "apps/registry/package.json"),
      `${JSON.stringify({ name: "registry", version: "0.1.0" }, null, 2)}\n`,
    );
    bumpAppVersions(root, "registry", "0.2.0");
    expect(
      (
        JSON.parse(readFileSync(path.join(root, "apps/registry/package.json"), "utf8")) as {
          version: string;
        }
      ).version,
    ).toBe("0.2.0");
  });
});
