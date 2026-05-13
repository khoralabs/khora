import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadIdentity } from "@khoralabs/atrium-auth";
import {
  type AtriumAppConfigBase,
  AtriumClient,
  AtriumClientError,
  type CachedProfileSnapshot,
  loadCachedProfile,
  resolveProfileSyncPath,
  serializeProfileSyncStateFile,
} from "@khoralabs/atrium-client";
import { cliAppConfig } from "../app-config.ts";
import { baseUrlFromEnv, identityPathFromConfig } from "../flows/context.ts";
import { boolFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

export type WhoamiOutput = {
  did: string;
  username?: string;
  displayName?: string;
  bio?: string;
  source: "cache" | "live" | "identity-only";
  cachedAtMs?: number;
};

export type WhoamiIo = {
  log(line: string): void;
  err(line: string): void;
  exit(code: number): never;
};

export type WhoamiDeps = {
  did: string;
  cachePath: string | undefined;
  noFetch: boolean;
  fetchLive: () => Promise<CachedProfileSnapshot>;
  nowMs: () => number;
  loadCache: (path: string) => CachedProfileSnapshot | undefined;
  writeCache?: (path: string, contents: string) => void;
};

function formatHumanAge(deltaMs: number): string {
  const sec = Math.max(0, Math.floor(deltaMs / 1000));
  if (sec < 90) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 90) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function printHuman(out: WhoamiOutput, io: WhoamiIo, nowMs: number): void {
  io.log(`DID:      ${out.did}`);
  if (out.source === "identity-only") {
    io.log("Username: <unknown — host unreachable and no cache>");
    return;
  }
  io.log(`Username: ${out.username ?? "<missing>"}`);
  if (out.displayName !== undefined) io.log(`Display:  ${out.displayName}`);
  if (out.bio !== undefined) io.log(`Bio:      ${out.bio}`);
  if (out.source === "cache" && out.cachedAtMs !== undefined) {
    io.log(`Source:   cache (${formatHumanAge(nowMs - out.cachedAtMs)})`);
  } else {
    io.log("Source:   live");
  }
}

function snapshotToOutput(snap: CachedProfileSnapshot, source: "cache" | "live"): WhoamiOutput {
  return {
    did: snap.did,
    username: snap.profile.username,
    ...(snap.profile.displayName !== undefined ? { displayName: snap.profile.displayName } : {}),
    ...(snap.profile.bio !== undefined ? { bio: snap.profile.bio } : {}),
    source,
    ...(source === "cache" ? { cachedAtMs: snap.syncedAtMs } : {}),
  };
}

/** Pure entry point for tests; all deps injected. */
export async function runWhoamiWith(deps: WhoamiDeps, json: boolean, io: WhoamiIo): Promise<void> {
  const cached = deps.cachePath !== undefined ? deps.loadCache(deps.cachePath) : undefined;
  if (cached !== undefined && cached.did === deps.did) {
    const out = snapshotToOutput(cached, "cache");
    if (json) io.log(JSON.stringify(out));
    else printHuman(out, io, deps.nowMs());
    return;
  }

  if (deps.noFetch) {
    const out: WhoamiOutput = { did: deps.did, source: "identity-only" };
    if (json) io.log(JSON.stringify(out));
    else printHuman(out, io, deps.nowMs());
    io.exit(3);
  }

  try {
    const fresh = await deps.fetchLive();
    if (deps.cachePath !== undefined && deps.writeCache !== undefined) {
      try {
        deps.writeCache(deps.cachePath, serializeProfileSyncStateFile(fresh));
      } catch {
        /* best-effort */
      }
    }
    const out = snapshotToOutput(fresh, "live");
    if (json) io.log(JSON.stringify(out));
    else printHuman(out, io, deps.nowMs());
  } catch (e) {
    if (e instanceof AtriumClientError && (e.status === 400 || e.status === 404)) {
      io.err("Not registered yet. Run 'atrium register'.");
      io.exit(3);
    }
    const out: WhoamiOutput = { did: deps.did, source: "identity-only" };
    if (json) io.log(JSON.stringify(out));
    else printHuman(out, io, deps.nowMs());
    io.exit(3);
  }
}

const DEFAULT_IO: WhoamiIo = {
  log: (l) => console.log(l),
  err: (l) => console.error(l),
  exit: (c) => process.exit(c),
};

function defaultWriteCache(p: string, contents: string): void {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, contents, "utf8");
}

export async function runWhoamiCommand(
  flags: FlagMap,
  cfg: AtriumAppConfigBase = cliAppConfig,
  io: WhoamiIo = DEFAULT_IO,
): Promise<void> {
  const json = boolFlag(flags, "json");
  const noFetch = boolFlag(flags, "no-fetch") || boolFlag(flags, "noFetch");

  const idPath = identityPathFromConfig();
  const signer = await loadIdentity(idPath);
  if (signer === undefined) {
    io.err(`No agent identity at ${idPath}. Run 'atrium key generate' first.`);
    io.exit(1);
  }

  const cachePath = resolveProfileSyncPath(cfg);
  const client = new AtriumClient({ baseUrl: baseUrlFromEnv(), signer });
  try {
    await runWhoamiWith(
      {
        did: signer.did,
        cachePath,
        noFetch,
        loadCache: loadCachedProfile,
        nowMs: () => Date.now(),
        writeCache: defaultWriteCache,
        fetchLive: async () => {
          const snap = await client.fetchAgentSync();
          return {
            did: signer.did,
            profile: snap.profile,
            topicSlugs: snap.topicSlugs,
            authorTopics: snap.authorTopics,
            probes: snap.probes,
            syncedAtMs: Date.now(),
          };
        },
      },
      json,
      io,
    );
  } finally {
    client.dispose();
  }
}
