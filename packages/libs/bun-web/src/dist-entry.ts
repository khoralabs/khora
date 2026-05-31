import path from "node:path";

/** Absolute path to `index.js` inside the app's web build output (default `dist/index.js`). */
export function resolveDistIndex(cwd = process.cwd(), outdir = "dist"): string {
  return path.resolve(cwd, outdir, "index.js");
}

/**
 * Working directory for `bun dist/index.js`.
 * HTML manifests reference chunks as `./chunk-*.js` next to `index.js`.
 */
export function resolveDistServeCwd(cwd = process.cwd(), outdir = "dist"): string {
  return path.resolve(cwd, outdir);
}
