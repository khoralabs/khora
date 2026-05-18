import { homedir } from "node:os";
import path from "node:path";

import type { VellumAppConfigBase } from "./schema.ts";

/** Canonical ATRIUM / Atrium host when config files and env omit `baseUrl`. */
export const VELLUM_CANONICAL_BASE_URL = "https://atr1.khoralabs.com" as const;

/** Default {@link VellumAppConfigBase.dataDir}: room DB + control files under `~/.vellum/data/obp/...`. */
export function vellumDefaultDataDir(): string {
  return path.join(homedir(), ".vellum", "data");
}

/** Lowest-priority layer: overridden by {@link vellumAppConfigFromEnv} and config files. */
export function vellumAppConfigBuiltinDefaults(): VellumAppConfigBase {
  return {
    baseUrl: VELLUM_CANONICAL_BASE_URL,
    dataDir: vellumDefaultDataDir(),
  };
}
