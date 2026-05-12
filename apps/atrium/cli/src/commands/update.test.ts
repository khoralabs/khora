import { describe, expect, test } from "bun:test";
import type { FlagMap } from "./types.ts";
import {
  compareVersions,
  currentVersion,
  detectPackageManager,
  fetchLatestVersion,
  managerInstallArgs,
  PKG_NAME,
  REGISTRY,
  runUpdateCommand,
} from "./update.ts";

describe("currentVersion", () => {
  test("returns env value when set", () => {
    expect(currentVersion({ ATRIUM_CLI_VERSION: "1.2.3" })).toBe("1.2.3");
  });
  test("trims whitespace", () => {
    expect(currentVersion({ ATRIUM_CLI_VERSION: "  1.2.3  " })).toBe("1.2.3");
  });
  test("falls back to 'dev' when unset", () => {
    expect(currentVersion({})).toBe("dev");
  });
  test("falls back to 'dev' when empty/whitespace", () => {
    expect(currentVersion({ ATRIUM_CLI_VERSION: "   " })).toBe("dev");
  });
});

describe("compareVersions", () => {
  test("numeric segments compared as numbers, not strings", () => {
    expect(compareVersions("1.2.10", "1.2.9")).toBe(1);
    expect(compareVersions("1.2.9", "1.2.10")).toBe(-1);
  });
  test("equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });
  test("major / minor / patch precedence", () => {
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.3.0", "1.2.99")).toBe(1);
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
  });
  test("prerelease is lower than equivalent release", () => {
    expect(compareVersions("1.2.3-next.1", "1.2.3")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.3-next.1")).toBe(1);
  });
  test("prerelease tails are compared lexicographically", () => {
    expect(compareVersions("1.2.3-next.1", "1.2.3-next.2")).toBe(-1);
    expect(compareVersions("1.2.3-rc.2", "1.2.3-rc.10")).toBe(1); // lexical, documented
  });
  test("'dev' is lower than any release", () => {
    expect(compareVersions("dev", "0.0.1")).toBe(-1);
    expect(compareVersions("0.0.1", "dev")).toBe(1);
    expect(compareVersions("dev", "dev")).toBe(0);
  });
});

describe("detectPackageManager", () => {
  test("explicit flag wins", () => {
    expect(detectPackageManager({ flag: "pnpm", env: { npm_config_user_agent: "yarn/1" } })).toBe(
      "pnpm",
    );
  });
  test("throws on unknown flag value", () => {
    expect(() => detectPackageManager({ flag: "rpm" })).toThrow();
  });
  test("npm_config_user_agent prefix detected (pnpm)", () => {
    expect(detectPackageManager({ env: { npm_config_user_agent: "pnpm/8.0.0 node/v20" } })).toBe(
      "pnpm",
    );
  });
  test("npm_config_user_agent prefix detected (yarn)", () => {
    expect(detectPackageManager({ env: { npm_config_user_agent: "yarn/3.5.1" } })).toBe("yarn");
  });
  test("npm_config_user_agent prefix detected (bun)", () => {
    expect(detectPackageManager({ env: { npm_config_user_agent: "bun/1.0.0" } })).toBe("bun");
  });
  test("npm_config_user_agent prefix detected (npm)", () => {
    expect(detectPackageManager({ env: { npm_config_user_agent: "npm/9.6.7" } })).toBe("npm");
  });
  test("PATH heuristic: first found wins", () => {
    expect(
      detectPackageManager({
        env: {},
        which: (cmd) => cmd === "pnpm" || cmd === "bun",
      }),
    ).toBe("pnpm");
    expect(detectPackageManager({ env: {}, which: (cmd) => cmd === "yarn" })).toBe("yarn");
  });
  test("ultimate fallback is npm", () => {
    expect(detectPackageManager({ env: {}, which: () => false })).toBe("npm");
  });
});

describe("managerInstallArgs", () => {
  const spec = `${PKG_NAME}@latest`;
  test("npm uses 'install -g'", () => {
    expect(managerInstallArgs("npm", spec)).toEqual(["install", "-g", spec]);
  });
  test("pnpm uses 'add -g'", () => {
    expect(managerInstallArgs("pnpm", spec)).toEqual(["add", "-g", spec]);
  });
  test("yarn uses 'global add'", () => {
    expect(managerInstallArgs("yarn", spec)).toEqual(["global", "add", spec]);
  });
  test("bun uses 'install -g'", () => {
    expect(managerInstallArgs("bun", spec)).toEqual(["install", "-g", spec]);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("fetchLatestVersion", () => {
  test("returns version from a 200 response with the requested tag", async () => {
    let calledUrl = "";
    const fetchImpl = ((url: string) => {
      calledUrl = url;
      return Promise.resolve(jsonResponse({ name: PKG_NAME, version: "2.4.1" }));
    }) as unknown as typeof fetch;
    const v = await fetchLatestVersion({ tag: "next", fetchImpl });
    expect(v).toBe("2.4.1");
    expect(calledUrl).toBe(`${REGISTRY}/${PKG_NAME}/next`);
  });

  test("throws on non-2xx", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        jsonResponse({ error: "not found" }, { status: 404 }),
      )) as unknown as typeof fetch;
    let err: Error | undefined;
    try {
      await fetchLatestVersion({ fetchImpl });
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message ?? "").toContain("404");
  });

  test("throws when response body has no version", async () => {
    const fetchImpl = (() =>
      Promise.resolve(jsonResponse({ name: PKG_NAME }))) as unknown as typeof fetch;
    let err: Error | undefined;
    try {
      await fetchLatestVersion({ fetchImpl });
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message ?? "").toContain("missing 'version'");
  });
});

function captureStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | undefined;
  return {
    out: (line: string) => stdout.push(line),
    err: (line: string) => stderr.push(line),
    exit: (code: number) => {
      exitCode = code;
    },
    stdout,
    stderr,
    getExit: () => exitCode,
  };
}

const fetchReturning = (v: string) =>
  (() => Promise.resolve(jsonResponse({ name: PKG_NAME, version: v }))) as unknown as typeof fetch;

describe("runUpdateCommand", () => {
  test("--check reports both versions and exits 10 when an update is available", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.0.0";
    const s = captureStreams();
    try {
      await runUpdateCommand({ check: true } as FlagMap, {
        fetchImpl: fetchReturning("1.5.0"),
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    expect(s.getExit()).toBe(10);
    expect(s.stdout.some((l) => l === "current: 1.0.0")).toBe(true);
    expect(s.stdout.some((l) => l.startsWith("latest:  1.5.0"))).toBe(true);
  });

  test("--check exits 0 when up to date", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.5.0";
    const s = captureStreams();
    try {
      await runUpdateCommand({ check: true } as FlagMap, {
        fetchImpl: fetchReturning("1.5.0"),
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    expect(s.getExit()).toBe(0);
    expect(s.stdout.some((l) => l === "Up to date.")).toBe(true);
  });

  test("--json emits the structured result and skips interactive prompts", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.0.0";
    const s = captureStreams();
    try {
      await runUpdateCommand({ json: true, check: true } as FlagMap, {
        fetchImpl: fetchReturning("1.6.0"),
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    const parsed = JSON.parse(s.stdout.join("\n"));
    expect(parsed).toMatchObject({
      current: "1.0.0",
      latest: "1.6.0",
      tag: "latest",
      hasUpdate: true,
      applied: false,
    });
    expect(s.getExit()).toBe(10);
  });

  test("--apply triggers spawn with the detected manager's argv and propagates exit code", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.0.0";
    const s = captureStreams();
    let stoppedDaemon = false;
    let spawnedCmd = "";
    let spawnedArgs: string[] = [];
    try {
      await runUpdateCommand({ apply: true } as FlagMap, {
        fetchImpl: fetchReturning("1.6.0"),
        which: (cmd) => cmd === "pnpm",
        stopDaemon: async () => {
          stoppedDaemon = true;
        },
        spawnInstall: async (cmd, args) => {
          spawnedCmd = cmd;
          spawnedArgs = args;
          return 0;
        },
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    expect(stoppedDaemon).toBe(true);
    expect(spawnedCmd).toBe("pnpm");
    expect(spawnedArgs).toEqual(["add", "-g", `${PKG_NAME}@latest`]);
    expect(s.getExit()).toBe(0);
  });

  test("--apply respects --tag in the install spec", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.0.0";
    const s = captureStreams();
    let spawnedArgs: string[] = [];
    try {
      await runUpdateCommand({ apply: true, tag: "next" } as FlagMap, {
        fetchImpl: fetchReturning("2.0.0-next.1"),
        which: (cmd) => cmd === "npm",
        stopDaemon: async () => {},
        spawnInstall: async (_cmd, args) => {
          spawnedArgs = args;
          return 0;
        },
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    expect(spawnedArgs).toEqual(["install", "-g", `${PKG_NAME}@next`]);
  });

  test("--apply when up to date exits 0 and never spawns", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.5.0";
    const s = captureStreams();
    let spawned = false;
    try {
      await runUpdateCommand({ apply: true } as FlagMap, {
        fetchImpl: fetchReturning("1.5.0"),
        which: () => true,
        stopDaemon: async () => {},
        spawnInstall: async () => {
          spawned = true;
          return 0;
        },
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    expect(spawned).toBe(false);
    expect(s.getExit()).toBe(0);
  });

  test("registry error: prints to stderr, exits 1", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.0.0";
    const s = captureStreams();
    try {
      await runUpdateCommand({} as FlagMap, {
        fetchImpl: (() => Promise.reject(new Error("ENETUNREACH"))) as unknown as typeof fetch,
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    expect(s.getExit()).toBe(1);
    expect(s.stderr.some((l) => l.includes("ENETUNREACH"))).toBe(true);
  });

  test("interactive default on non-TTY without --apply: prompt advice, exit 0, no spawn", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.0.0";
    const s = captureStreams();
    let spawned = false;
    try {
      await runUpdateCommand({} as FlagMap, {
        fetchImpl: fetchReturning("1.5.0"),
        which: () => true,
        isTty: false,
        spawnInstall: async () => {
          spawned = true;
          return 0;
        },
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    expect(spawned).toBe(false);
    expect(s.getExit()).toBe(0);
    expect(s.stdout.some((l) => l.includes("Re-run with --apply"))).toBe(true);
  });

  test("interactive prompt: 'y' triggers spawn", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.0.0";
    const s = captureStreams();
    let spawned = false;
    try {
      await runUpdateCommand({} as FlagMap, {
        fetchImpl: fetchReturning("1.5.0"),
        which: () => true,
        isTty: true,
        prompt: async () => true,
        stopDaemon: async () => {},
        spawnInstall: async () => {
          spawned = true;
          return 0;
        },
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    expect(spawned).toBe(true);
  });

  test("interactive prompt: 'n' skips spawn", async () => {
    const env = process.env.ATRIUM_CLI_VERSION;
    process.env.ATRIUM_CLI_VERSION = "1.0.0";
    const s = captureStreams();
    let spawned = false;
    try {
      await runUpdateCommand({} as FlagMap, {
        fetchImpl: fetchReturning("1.5.0"),
        which: () => true,
        isTty: true,
        prompt: async () => false,
        spawnInstall: async () => {
          spawned = true;
          return 0;
        },
        out: s.out,
        err: s.err,
        exit: s.exit,
      });
    } finally {
      if (env === undefined) delete process.env.ATRIUM_CLI_VERSION;
      else process.env.ATRIUM_CLI_VERSION = env;
    }
    expect(spawned).toBe(false);
    expect(s.getExit()).toBe(0);
  });
});
