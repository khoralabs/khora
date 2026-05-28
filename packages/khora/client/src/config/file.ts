import { readFileSync } from "node:fs";
import path from "node:path";
import { KhoraConfigError } from "./errors.ts";
import { mergeKhoraAppConfigLayers } from "./merge.ts";

export type KhoraConfigFileRead = {
  /** Plain (unvalidated) merged object — extends chain already folded in. */
  merged: Record<string, unknown>;
  /** Absolute paths of every file read, deepest base first, entry file last. */
  chain: string[];
};

type ReadOptions = {
  explicit: boolean;
  visited: Set<string>;
  fs?: { readFileSync: (p: string) => string };
};

function defaultRead(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function parseExtends(value: unknown, sourcePath: string): string[] {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value;
  throw new KhoraConfigError(
    [
      {
        code: "custom",
        message: "extends must be a string or an array of strings",
        path: ["extends"],
        input: value,
      } as never,
    ],
    sourcePath,
  );
}

function readOne(absPath: string, opts: ReadOptions): KhoraConfigFileRead | undefined {
  if (opts.visited.has(absPath)) {
    throw new KhoraConfigError(
      [
        {
          code: "custom",
          message: `extends cycle detected at ${absPath}`,
          path: [],
          input: absPath,
        } as never,
      ],
      absPath,
    );
  }
  let text: string;
  try {
    text = (opts.fs?.readFileSync ?? defaultRead)(absPath);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      if (opts.explicit) {
        throw new KhoraConfigError(
          [
            {
              code: "custom",
              message: `Config file not found: ${absPath}`,
              path: [],
              input: absPath,
            } as never,
          ],
          absPath,
        );
      }
      return undefined;
    }
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new KhoraConfigError(
      [
        {
          code: "custom",
          message: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
          path: [],
          input: text,
        } as never,
      ],
      absPath,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new KhoraConfigError(
      [
        {
          code: "custom",
          message: "Config root must be an object",
          path: [],
          input: parsed,
        } as never,
      ],
      absPath,
    );
  }
  const own = parsed as Record<string, unknown>;
  const extendsList = parseExtends(own.extends, absPath);
  const nextVisited = new Set(opts.visited);
  nextVisited.add(absPath);
  const baseLayers: Array<Record<string, unknown>> = [];
  const chain: string[] = [];
  const dir = path.dirname(absPath);
  for (const rel of extendsList) {
    const baseAbs = path.resolve(dir, rel);
    const baseRead = readOne(baseAbs, {
      explicit: true,
      visited: nextVisited,
      fs: opts.fs,
    });
    if (baseRead !== undefined) {
      baseLayers.push(baseRead.merged);
      chain.push(...baseRead.chain);
    }
  }
  const ownLayer: Record<string, unknown> = { ...own };
  delete ownLayer.extends;
  const merged = mergeKhoraAppConfigLayers([...baseLayers, ownLayer]);
  chain.push(absPath);
  return { merged, chain };
}

/**
 * Read a config file, recursively resolving any `extends` references (relative to the referencing
 * file). Returns the merged unvalidated object plus a flat list of every file read. Deeper bases
 * appear first in the chain; the entry file is last.
 *
 * - `explicit === true`: ENOENT throws.
 * - `explicit === false` (auto-discovered default path): ENOENT returns `undefined`.
 *
 * The `extends` field itself is stripped from the merged output.
 */
export function readKhoraConfigFileWithExtends(
  entryPath: string,
  options: {
    explicit?: boolean;
    fs?: { readFileSync: (p: string) => string };
  } = {},
): KhoraConfigFileRead | undefined {
  const abs = path.resolve(entryPath);
  return readOne(abs, {
    explicit: options.explicit ?? true,
    visited: new Set<string>(),
    fs: options.fs,
  });
}
