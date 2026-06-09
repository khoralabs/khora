import { homedir } from "node:os";
import path from "node:path";

import type { VellumAppConfigBase } from "./schema";

/** Canonical Khora discovery host when config files and env omit `khoraBaseUrl`. */
export const VELLUM_CANONICAL_KHORA_BASE_URL = "https://k-0.khoralabs.com" as const;

/** Default {@link VellumAppConfigBase.dataDir}: artifacts under `~/.vellum/data/vellum/channels/...`. */
export function vellumDefaultDataDir(): string {
  return path.join(homedir(), ".vellum", "data");
}

/** Lowest-priority layer: overridden by {@link vellumAppConfigFromEnv} and config files. */
export function vellumAppConfigBuiltinDefaults(): VellumAppConfigBase {
  return {
    khoraBaseUrl: VELLUM_CANONICAL_KHORA_BASE_URL,
    dataDir: vellumDefaultDataDir(),
  };
}
