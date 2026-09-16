import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function repoRoot(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(directory, "packages/host/package.json"))) return directory;
    directory = path.dirname(directory);
  }
  throw new Error("khora repository root not found");
}

const root = repoRoot();
const hostTest = path.join(root, "packages/host/src/fanout/fanout-scalability.integration.test.ts");

async function runMatrix(env: Record<string, string>): Promise<void> {
  const proc = Bun.spawn(["bun", "test", hostTest], {
    cwd: root,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  expect(code).toBe(0);
}

const ci = process.env.KHORA_FANOUT_CI_MATRIX === "1" || process.env.KHORA_SCALE_TEST === "1";

test.skipIf(!ci)(
  "CI fan-out matrix with in-memory receipts",
  async () => {
    await runMatrix({ KHORA_FANOUT_CI_MATRIX: "1" });
  },
  { timeout: 600_000 },
);

test.skipIf(!ci)(
  "CI fan-out matrix with filesystem receipts",
  async () => {
    await runMatrix({ KHORA_FANOUT_CI_MATRIX: "1", KHORA_FANOUT_RECEIPT_FS: "1" });
  },
  { timeout: 600_000 },
);

test.skipIf(process.env.KHORA_SCALE_TEST !== "1")(
  "opt-in 100k-principal stress profile",
  async () => {
    await runMatrix({ KHORA_SCALE_TEST: "1" });
  },
  { timeout: 3_600_000 },
);
