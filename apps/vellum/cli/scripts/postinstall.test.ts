import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runVellumConfigSetup, runVellumPostinstall } from "./postinstall.ts";

let workspace: string;
let home: string;

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), "vellum-postinstall-"));
  home = path.join(workspace, "home");
  mkdirSync(home, { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("runVellumPostinstall", () => {
  test("creates ~/.vellum on a clean home", () => {
    const result = runVellumPostinstall({ home });
    const dest = path.join(home, ".vellum");
    expect(result.destDir).toBe(dest);
    expect(result.copied).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(existsSync(dest)).toBe(true);
  });

  test("idempotent on repeat invocations", () => {
    const first = runVellumPostinstall({ home });
    expect(existsSync(first.destDir)).toBe(true);
    const second = runVellumPostinstall({ home });
    expect(second.destDir).toBe(first.destDir);
    expect(existsSync(second.destDir)).toBe(true);
  });

  test("creates ~/.vellum when home dir exists but .vellum does not", () => {
    expect(existsSync(path.join(home, ".vellum"))).toBe(false);
    runVellumPostinstall({ home });
    expect(existsSync(path.join(home, ".vellum"))).toBe(true);
  });
});

describe("runVellumConfigSetup", () => {
  test("creates ~/.vellum and returns empty arrays", () => {
    const result = runVellumConfigSetup({ home });
    const dest = path.join(home, ".vellum");
    expect(result.destDir).toBe(dest);
    expect(result.copied).toEqual([]);
    expect(result.overwritten).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(existsSync(dest)).toBe(true);
  });

  test("force=true is a no-op in Phase 2 (no config files)", () => {
    const result = runVellumConfigSetup({ home, force: true });
    expect(result.copied).toEqual([]);
    expect(result.overwritten).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(existsSync(path.join(home, ".vellum"))).toBe(true);
  });

  test("idempotent: second call with existing dir still succeeds", () => {
    runVellumConfigSetup({ home });
    const second = runVellumConfigSetup({ home });
    expect(existsSync(second.destDir)).toBe(true);
  });
});
