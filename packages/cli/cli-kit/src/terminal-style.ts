import logSymbols from "log-symbols";
import picocolors from "picocolors";

type Colors = ReturnType<typeof picocolors.createColors>;
const { createColors } = picocolors;

/** Matches picocolors default `isColorSupported` (re-evaluated per call). */
function isColorSupported(): boolean {
  const p = process;
  const env = p.env ?? {};
  const argv = p.argv ?? [];
  if (env.NO_COLOR || argv.includes("--no-color")) return false;
  return (
    !!env.FORCE_COLOR ||
    argv.includes("--color") ||
    p.platform === "win32" ||
    ((p.stdout?.isTTY ?? false) && env.TERM !== "dumb") ||
    !!env.CI
  );
}

function colors(): Colors {
  return createColors(isColorSupported());
}

/** Picocolors namespace (`green`, `dim`, …). Respects `NO_COLOR` / `FORCE_COLOR`. */
export const pc: Colors = new Proxy({} as Colors, {
  get(_target, prop) {
    const c = colors();
    const value = c[prop as keyof Colors];
    if (typeof value === "function") {
      return (value as (s: string) => string).bind(c);
    }
    return value;
  },
});

/** Semantic ANSI wrappers for CLI output (all respect `NO_COLOR` / `FORCE_COLOR`). */
export const style = {
  success: (s: string): string => colors().green(s),
  error: (s: string): string => colors().red(s),
  warn: (s: string): string => colors().yellow(s),
  info: (s: string): string => colors().cyan(s),
  muted: (s: string): string => colors().dim(s),
  bold: (s: string): string => colors().bold(s),
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
