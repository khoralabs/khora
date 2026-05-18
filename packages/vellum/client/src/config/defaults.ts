import type { VellumAppConfigBase } from "./schema.ts";

/** Canonical AT2 / Atrium host when config files and env omit `baseUrl`. */
export const VELLUM_CANONICAL_BASE_URL = "https://atr1.khoralabs.com" as const;

/** Lowest-priority layer: overridden by {@link vellumAppConfigFromEnv} and config files. */
export function vellumAppConfigBuiltinDefaults(): VellumAppConfigBase {
  return { baseUrl: VELLUM_CANONICAL_BASE_URL };
}
