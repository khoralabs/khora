import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { defaultAtriumConfigPath } from "@cfd/atrium-client";
import { cliAppConfig, cliAppConfigExtends, cliAppConfigSource } from "../app-config.ts";
import { boolFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

const STUB_SCHEMA_REL = "./node_modules/@cfd/atrium-client/atrium-config.schema.json";

export type ConfigShowMode = "effective" | "raw" | "source";

export type ConfigShowBundle = {
  effective: unknown;
  sourcePath: string | undefined;
  extendsChain: readonly string[];
};

/** Pure formatter for `atrium config show`. Returns the string to print or throws on misuse. */
export function formatConfigShow(
  bundle: ConfigShowBundle,
  mode: ConfigShowMode,
  readFile: (p: string) => string = (p) => readFileSync(p, "utf8"),
): string {
  if (mode === "effective") return JSON.stringify(bundle.effective, null, 2);
  if (mode === "source") {
    if (bundle.sourcePath === undefined) {
      throw new Error("no config file is in use; nothing to show with --source");
    }
    return [bundle.sourcePath, ...bundle.extendsChain.filter((p) => p !== bundle.sourcePath)].join(
      "\n",
    );
  }
  if (bundle.sourcePath === undefined) {
    throw new Error("no config file is in use; nothing to show with --raw");
  }
  return readFile(bundle.sourcePath);
}

export function resolveEditor(env: NodeJS.ProcessEnv): { cmd: string; args: string[] } {
  const raw = (env.VISUAL ?? env.EDITOR ?? "vi").trim();
  const parts = raw.split(/\s+/).filter((p) => p.length > 0);
  const cmd = parts[0] ?? "vi";
  return { cmd, args: parts.slice(1) };
}

function pickShowMode(flags: FlagMap): ConfigShowMode {
  const raw = boolFlag(flags, "raw");
  const source = boolFlag(flags, "source");
  if (raw && source) {
    throw new Error("--raw and --source are mutually exclusive");
  }
  if (raw) return "raw";
  if (source) return "source";
  return "effective";
}

function runConfigPath(): void {
  if (cliAppConfigSource !== undefined) {
    console.log(cliAppConfigSource);
    return;
  }
  const def = defaultAtriumConfigPath();
  console.log(def);
  console.error(`(no config file found; default path would be ${def})`);
  process.exit(2);
}

function runConfigShow(flags: FlagMap): void {
  const mode = pickShowMode(flags);
  const out = formatConfigShow(
    {
      effective: cliAppConfig,
      sourcePath: cliAppConfigSource,
      extendsChain: cliAppConfigExtends,
    },
    mode,
  );
  console.log(out);
}

async function runConfigEdit(): Promise<void> {
  const target = cliAppConfigSource ?? defaultAtriumConfigPath();
  if (!existsSync(target)) {
    await mkdir(dirname(target), { recursive: true });
    const stub = { $schema: STUB_SCHEMA_REL, plugins: {} };
    await writeFile(target, `${JSON.stringify(stub, null, 2)}\n`, { flag: "wx" });
  }
  const { cmd, args } = resolveEditor(process.env);
  const proc = Bun.spawn([cmd, ...args, target], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(await proc.exited);
}

export async function runConfigCommand(
  sub: string | undefined,
  flags: FlagMap,
): Promise<void> {
  switch (sub) {
    case "path":
      runConfigPath();
      return;
    case "show":
      runConfigShow(flags);
      return;
    case "edit":
      await runConfigEdit();
      return;
    default:
      console.error("config: subcommand required: path | show | edit");
      process.exit(1);
  }
}
