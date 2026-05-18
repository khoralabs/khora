import logSymbols from "log-symbols";
import pc from "picocolors";

/** Picocolors namespace (`green`, `dim`, …). Respects `NO_COLOR` / `FORCE_COLOR`. */
export { pc };

/** Semantic ANSI wrappers for CLI output (all respect `NO_COLOR` / `FORCE_COLOR`). */
export const style = {
  success: (s: string): string => pc.green(s),
  error: (s: string): string => pc.red(s),
  warn: (s: string): string => pc.yellow(s),
  info: (s: string): string => pc.cyan(s),
  muted: (s: string): string => pc.dim(s),
  bold: (s: string): string => pc.bold(s),
};

/**
 * Cross-platform glyphs from [log-symbols](https://github.com/sindresorhus/log-symbols)
 * (e.g. Unicode vs Windows fallback).
 */
export const symbols = {
  success: logSymbols.success,
  error: logSymbols.error,
  warning: logSymbols.warning,
  info: logSymbols.info,
};
