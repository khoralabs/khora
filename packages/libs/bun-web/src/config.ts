import type { BunPlugin } from "bun";

export type WebUiMount = {
  /** Key used in buildRoutesFromMounts imports map */
  name: string;
  /** Documented path to HTML entry (for humans / tooling) */
  html: string;
  /** Bun.serve route keys that serve this HTML manifest */
  routes: string[];
};

export type WebUiCheckConfig = {
  forbid?: RegExp[];
};

export type WebUiConfig = {
  /** Server entry that imports HTML files (e.g. ./src/index.ts) */
  serverEntry: string;
  outdir?: string;
  plugins?: BunPlugin[];
  /** Passed to Bun.build `env` when set (e.g. "BUN_PUBLIC_*") */
  buildEnv?: "inline" | "disable" | `${string}*`;
  /**
   * When false (default), leave dependencies external so native addons (sqlite-vec, etc.)
   * resolve from node_modules at runtime. HTML/JS/CSS assets still emit to `outdir`.
   */
  bundleDependencies?: boolean;
  mounts: WebUiMount[];
  check?: WebUiCheckConfig;
};

export function defineWebUi(config: WebUiConfig): WebUiConfig {
  return config;
}
